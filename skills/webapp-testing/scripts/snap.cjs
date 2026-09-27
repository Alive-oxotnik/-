#!/usr/bin/env node
/*
 * snap.cjs — open a page in headless Chromium, optionally click/type through a
 * flow, save screenshots at several viewport widths and report what went wrong:
 * console errors, uncaught exceptions, failed requests, broken images and
 * horizontal overflow (the most common responsive bug).
 *
 *   node snap.cjs <url> [options] [steps...]
 *
 * Options
 *   --out <dir>           where to write PNGs            (default: <tmp>/snaps)
 *   --widths <list>       viewport widths, comma-separated (default: 390,1280)
 *   --height <px>         viewport height                 (default: by width)
 *   --full                capture the whole scrollable page
 *   --element <selector>  capture a single element instead of the viewport
 *   --dark                emulate prefers-color-scheme: dark
 *   --reduced-motion      emulate prefers-reduced-motion: reduce
 *   --wait-server <sec>   keep retrying until the URL answers (default: 30)
 *   --timeout <ms>        timeout for navigation and each step (default: 15000)
 *   --json                print the report as JSON only
 *
 * Steps (run in the given order after the page loads, before the screenshot)
 *   --click <selector>    --hover <selector>    --press <key>    --type <text>
 *   --fill <selector>=<text>                    --goto <url>
 *   --wait <ms | selector>
 *
 * Selectors are Playwright selectors: CSS, "text=Sign in",
 * 'role=button[name="Save"]', "[data-testid=menu]", ...
 *
 * Exit code: 0 = no problems found, 1 = problems found, 2 = could not run.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { execSync } = require('child_process');

// ---------------------------------------------------------------- playwright

function loadPlaywright() {
  const bases = [process.cwd(), __dirname];
  try {
    bases.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
  } catch {}
  for (const base of bases) {
    const req = createRequire(path.join(base, 'noop.js'));
    for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
      try {
        const mod = req(name);
        if (mod && mod.chromium) return mod;
      } catch {}
    }
  }
  return null;
}

function chromiumCandidates() {
  const found = [];
  const envPath = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath) found.push(envPath);
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
  ].filter(Boolean);
  const inner = [
    ['chrome-linux', 'chrome'],
    ['chrome-linux64', 'chrome'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-win', 'chrome.exe'],
    ['chrome-win64', 'chrome.exe'],
  ];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    if (entries.includes('chromium')) found.push(path.join(root, 'chromium'));
    const revs = entries
      .filter((e) => /^chromium-\d+$/.test(e))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const rev of revs) {
      for (const parts of inner) {
        const p = path.join(root, rev, ...parts);
        if (fs.existsSync(p)) found.push(p);
      }
    }
  }
  return [...new Set(found)];
}

// Try Playwright's own browser first, then any Chromium already on disk (its
// revision may not match this Playwright version, which usually still works),
// then an installed Google Chrome.
async function launchChromium(chromium) {
  const attempts = [{}, ...chromiumCandidates().map((p) => ({ executablePath: p })), { channel: 'chrome' }];
  let lastError;
  for (const extra of attempts) {
    try {
      return await chromium.launch({ headless: true, ...extra });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------- args

function parseArgs(argv) {
  const opts = {
    url: null,
    out: path.join(os.tmpdir(), 'snaps'),
    widths: [390, 1280],
    height: null,
    full: false,
    element: null,
    dark: false,
    reducedMotion: false,
    waitServer: 30,
    timeout: 15000,
    json: false,
    steps: [],
  };
  const stepNames = new Set(['click', 'hover', 'press', 'type', 'fill', 'goto', 'wait']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (!arg.startsWith('--')) {
      if (opts.url) throw new Error(`unexpected argument: ${arg}`);
      opts.url = arg;
      continue;
    }
    const name = arg.slice(2);
    if (stepNames.has(name)) opts.steps.push({ type: name, value: next() });
    else if (name === 'out') opts.out = next();
    else if (name === 'widths') opts.widths = next().split(',').map((w) => parseInt(w, 10)).filter(Boolean);
    else if (name === 'height') opts.height = parseInt(next(), 10);
    else if (name === 'full') opts.full = true;
    else if (name === 'element') opts.element = next();
    else if (name === 'dark') opts.dark = true;
    else if (name === 'reduced-motion') opts.reducedMotion = true;
    else if (name === 'wait-server') opts.waitServer = parseFloat(next());
    else if (name === 'timeout') opts.timeout = parseInt(next(), 10);
    else if (name === 'json') opts.json = true;
    else if (name === 'help') opts.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return opts;
}

function usage() {
  const text = fs.readFileSync(__filename, 'utf8').split('\n');
  const start = text.findIndex((l) => l.startsWith('/*'));
  const end = text.findIndex((l) => l.startsWith(' */'));
  return text.slice(start + 1, end).map((l) => l.replace(/^ \* ?/, '')).join('\n');
}

// ------------------------------------------------------------------- helpers

async function waitForServer(url, seconds) {
  if (!/^https?:/i.test(url) || !seconds) return;
  const deadline = Date.now() + seconds * 1000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const reason = (lastError && lastError.cause && lastError.cause.code) || (lastError && lastError.message);
  throw new Error(`nothing answered at ${url} within ${seconds}s (${reason}). Is the dev server running?`);
}

function defaultHeight(width) {
  if (width <= 480) return 844;
  if (width <= 1024) return 1024;
  return 800;
}

// "--fill sel=text": split at the first "=" outside [...], (...) and quotes, so
// "[name=email]=ada@example.com" works. For selectors like "role=…" or "text=…",
// use "--click <selector> --type <text>" instead.
function splitIndex(value) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === '=' && depth === 0) return i;
  }
  return -1;
}

async function runStep(page, step, timeout) {
  const { type, value } = step;
  if (type === 'click') await page.locator(value).first().click({ timeout });
  else if (type === 'hover') await page.locator(value).first().hover({ timeout });
  else if (type === 'press') await page.keyboard.press(value);
  else if (type === 'type') await page.keyboard.type(value);
  else if (type === 'goto') await page.goto(value, { timeout, waitUntil: 'load' });
  else if (type === 'fill') {
    const eq = splitIndex(value);
    if (eq < 1) throw new Error(`--fill expects <selector>=<text>, got "${value}"`);
    await page.locator(value.slice(0, eq)).first().fill(value.slice(eq + 1), { timeout });
  } else if (type === 'wait') {
    if (/^\d+$/.test(value)) await page.waitForTimeout(parseInt(value, 10));
    else await page.locator(value).first().waitFor({ state: 'visible', timeout });
  }
}

// Runs in the page: find what makes the page wider than the viewport.
function inspectLayout() {
  const doc = document.documentElement;
  const viewport = doc.clientWidth;
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return `${s}#${el.id}`;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3) : [];
    if (cls.length && cls[0]) s += '.' + cls.join('.');
    const parent = el.parentElement;
    if (parent && parent !== document.body && parent !== doc) {
      let p = parent.tagName.toLowerCase();
      if (parent.id) p += `#${parent.id}`;
      s = `${p} > ${s}`;
    }
    return s;
  };
  const offenders = [];
  if (doc.scrollWidth > viewport + 1) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > viewport + 1 || r.left < -1) {
        // Fixed overlays stretch to the widened layout viewport: a symptom, not a cause.
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' && Math.abs(r.left) <= 1 && Math.abs(r.right - doc.scrollWidth) <= 1) continue;
        // Report the outermost offender only; its children usually overflow with it.
        if (offenders.some((o) => o.el.contains(el))) continue;
        offenders.push({ el, text: `${describe(el)} (left ${Math.round(r.left)}, right ${Math.round(r.right)}, width ${Math.round(r.width)})` });
        if (offenders.length >= 5) break;
      }
    }
  }
  const brokenImages = [...document.images]
    .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src'))
    .slice(0, 5)
    .map((img) => img.getAttribute('src'));
  return {
    viewportWidth: viewport,
    scrollWidth: doc.scrollWidth,
    overflowX: doc.scrollWidth > viewport + 1,
    offenders: offenders.map((o) => o.text),
    brokenImages,
    hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
  };
}

// ---------------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`snap: ${err.message}\n\n${usage()}`);
    process.exit(2);
  }
  if (opts.help || !opts.url) {
    console.log(usage());
    process.exit(opts.help ? 0 : 2);
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(opts.url) && !/^(about|data|file):/i.test(opts.url)) {
    opts.url = `http://${opts.url}`; // "localhost:5173" -> "http://localhost:5173"
  }

  const pw = loadPlaywright();
  if (!pw) {
    console.error('snap: Playwright not found. Install it in the project: npm i -D playwright (or @playwright/test)');
    process.exit(2);
  }

  try {
    await waitForServer(opts.url, opts.waitServer);
  } catch (err) {
    console.error(`snap: ${err.message}`);
    process.exit(2);
  }

  let browser;
  try {
    browser = await launchChromium(pw.chromium);
  } catch (err) {
    console.error(`snap: could not launch Chromium: ${err.message.split('\n')[0]}\n` +
      'Install a browser with "npx playwright install chromium" or point CHROMIUM_PATH at a Chrome/Chromium binary.');
    process.exit(2);
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  let slug = opts.url.replace(/^[a-z]+:\/\//i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!slug) slug = 'page';

  const runs = [];
  for (const width of opts.widths) {
    const height = opts.height || defaultHeight(width);
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: opts.dark ? 'dark' : 'light',
      reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const run = { width, height, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], stepError: null };

    page.on('console', (msg) => {
      const loc = msg.location();
      // Skip locations inside tooling wrappers (Vite client, node_modules): they point at the wrapper, not the caller.
      const useful = loc && loc.url && !/\/@vite\/|\/node_modules\//.test(loc.url);
      const where = useful ? ` (${loc.url.replace(/^https?:\/\/[^/]+/, '')}:${loc.lineNumber})` : '';
      if (msg.type() === 'error') run.consoleErrors.push(msg.text() + where);
      else if (msg.type() === 'warning') run.consoleWarnings.push(msg.text());
    });
    page.on('pageerror', (err) => run.pageErrors.push(String(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err)));
    page.on('requestfailed', (req) => {
      const reason = req.failure() ? req.failure().errorText : 'failed';
      // Aborted requests (navigation away, HMR pings) are noise, not bugs.
      if (!/ERR_ABORTED/.test(reason)) run.failedRequests.push(`${req.method()} ${req.url()} — ${reason}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) run.failedRequests.push(`${res.request().method()} ${res.url()} — HTTP ${res.status()}`);
    });

    try {
      const response = await page.goto(opts.url, { timeout: opts.timeout, waitUntil: 'load' });
      run.status = response ? response.status() : null;
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      for (const step of opts.steps) {
        try {
          await runStep(page, step, opts.timeout);
        } catch (err) {
          run.stepError = `--${step.type} ${step.value}: ${err.message.split('\n')[0]}`;
          break;
        }
      }
      await page.waitForTimeout(300); // let transitions settle
      run.title = await page.title();
      run.finalUrl = page.url();
      run.layout = await page.evaluate(inspectLayout);
      const file = path.join(opts.out, `${slug}-${width}w${opts.dark ? '-dark' : ''}-${stamp}.png`);
      if (opts.element) {
        await page.locator(opts.element).first().screenshot({ path: file, timeout: opts.timeout });
      } else {
        await page.screenshot({ path: file, fullPage: opts.full });
      }
      run.screenshot = file;
    } catch (err) {
      run.fatal = err.message.split('\n')[0];
    }
    await context.close();
    runs.push(run);
  }
  await browser.close();

  // Collate problems across widths so the same error is not listed twice.
  const uniq = (list) => [...new Set(list)];
  const report = {
    url: opts.url,
    screenshots: runs.filter((r) => r.screenshot).map((r) => r.screenshot),
    runs: runs.map((r) => ({
      width: r.width,
      height: r.height,
      status: r.status,
      title: r.title,
      finalUrl: r.finalUrl,
      screenshot: r.screenshot,
      overflowX: r.layout ? r.layout.overflowX : null,
      overflowOffenders: r.layout ? r.layout.offenders : [],
      fatal: r.fatal,
      stepError: r.stepError,
    })),
    consoleErrors: uniq(runs.flatMap((r) => r.consoleErrors)),
    consoleWarnings: uniq(runs.flatMap((r) => r.consoleWarnings)),
    pageErrors: uniq(runs.flatMap((r) => r.pageErrors)),
    failedRequests: uniq(runs.flatMap((r) => r.failedRequests)),
    brokenImages: uniq(runs.flatMap((r) => (r.layout ? r.layout.brokenImages : []))),
    missingViewportMeta: runs.some((r) => r.layout && !r.layout.hasViewportMeta),
  };
  const problems = [];
  for (const r of report.runs) {
    if (r.fatal) problems.push(`${r.width}px: ${r.fatal}`);
    if (r.stepError) problems.push(`${r.width}px: step failed ${r.stepError}`);
    if (r.status && r.status >= 400) problems.push(`${r.width}px: page returned HTTP ${r.status}`);
    if (r.overflowX) problems.push(`${r.width}px: horizontal overflow — ${r.overflowOffenders.join('; ') || 'offender not identified'}`);
  }
  if (report.pageErrors.length) problems.push(`${report.pageErrors.length} uncaught exception(s)`);
  if (report.consoleErrors.length) problems.push(`${report.consoleErrors.length} console error(s)`);
  if (report.failedRequests.length) problems.push(`${report.failedRequests.length} failed request(s)`);
  if (report.brokenImages.length) problems.push(`${report.brokenImages.length} broken image(s)`);
  if (report.missingViewportMeta) problems.push('no <meta name="viewport"> — mobile browsers will render a zoomed-out desktop layout');
  report.problems = problems;

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const lines = [`snap ${report.url}`];
    for (const r of report.runs) {
      lines.push(`  ${r.width}x${r.height}  HTTP ${r.status ?? '-'}  "${r.title ?? ''}"  -> ${r.screenshot || 'no screenshot'}`);
    }
    const section = (title, list, max = 10) => {
      if (!list.length) return;
      lines.push(`\n${title} (${list.length}):`);
      for (const item of list.slice(0, max)) lines.push(`  - ${item.length > 400 ? item.slice(0, 400) + '…' : item}`);
      if (list.length > max) lines.push(`  … ${list.length - max} more (use --json for all)`);
    };
    section('Uncaught exceptions', report.pageErrors);
    section('Console errors', report.consoleErrors);
    section('Failed requests', report.failedRequests);
    section('Broken images', report.brokenImages);
    section('Console warnings', report.consoleWarnings, 5);
    lines.push(problems.length ? `\nPROBLEMS:\n  - ${problems.join('\n  - ')}` : '\nNo problems detected. Now look at the screenshots.');
    console.log(lines.join('\n'));
  }
  process.exit(problems.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`snap: ${err.stack || err}`);
  process.exit(2);
});
