#!/usr/bin/env node
/*
 * a11y-audit.cjs — run axe-core (WCAG 2.2 A/AA rules) against one or more pages
 * in headless Chromium and, optionally, walk the page with the Tab key to show
 * the real keyboard focus order.
 *
 *   node a11y-audit.cjs <url> [more urls] [options] [steps...]
 *
 * Options
 *   --widths <list>       viewport widths, comma-separated   (default: 1280)
 *   --tags <list>         axe tags (default: wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22a,wcag22aa)
 *   --best-practices      also run axe "best-practice" rules
 *   --include <selector>  only audit this part of the page
 *   --exclude <selector>  skip this part of the page (repeatable)
 *   --fail-on <impact>    minor | moderate | serious | critical (default: serious)
 *   --tab <n>             press Tab n times and print the focus order
 *   --dark                emulate prefers-color-scheme: dark (contrast differs!)
 *   --wait-server <sec>   keep retrying until the URL answers (default: 30)
 *   --timeout <ms>        timeout for navigation and each step (default: 15000)
 *   --json                print the report as JSON only
 *
 * Steps (run in order after load, before auditing — e.g. open a dialog first)
 *   --click <selector>  --hover <selector>  --press <key>  --type <text>
 *   --fill <selector>=<text>
 *   --wait <ms | selector>
 *
 * Needs Playwright and axe-core. axe-core is looked up in the project, next to
 * this script, globally, or at $AXE_CORE_PATH (path to axe.min.js).
 * Exit code: 0 = nothing at or above --fail-on, 1 = violations, 2 = could not run.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { execSync } = require('child_process');

// ------------------------------------------------------------ module lookup

function searchBases() {
  const bases = [process.cwd(), __dirname];
  try {
    bases.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
  } catch {}
  return bases;
}

function loadPlaywright(bases) {
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

function loadAxeSource(bases) {
  if (process.env.AXE_CORE_PATH && fs.existsSync(process.env.AXE_CORE_PATH)) {
    return fs.readFileSync(process.env.AXE_CORE_PATH, 'utf8');
  }
  for (const base of bases) {
    const req = createRequire(path.join(base, 'noop.js'));
    try {
      const dir = path.dirname(req.resolve('axe-core/package.json'));
      return fs.readFileSync(path.join(dir, 'axe.min.js'), 'utf8');
    } catch {}
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

const IMPACTS = ['minor', 'moderate', 'serious', 'critical'];

function parseArgs(argv) {
  const opts = {
    urls: [],
    widths: [1280],
    tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
    bestPractices: false,
    include: null,
    exclude: [],
    failOn: 'serious',
    tab: 0,
    dark: false,
    waitServer: 30,
    timeout: 15000,
    json: false,
    steps: [],
  };
  const stepNames = new Set(['click', 'hover', 'press', 'type', 'fill', 'wait']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (!arg.startsWith('--')) {
      opts.urls.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (stepNames.has(name)) opts.steps.push({ type: name, value: next() });
    else if (name === 'widths') opts.widths = next().split(',').map((w) => parseInt(w, 10)).filter(Boolean);
    else if (name === 'tags') opts.tags = next().split(',').map((t) => t.trim()).filter(Boolean);
    else if (name === 'best-practices') opts.bestPractices = true;
    else if (name === 'include') opts.include = next();
    else if (name === 'exclude') opts.exclude.push(next());
    else if (name === 'fail-on') opts.failOn = next();
    else if (name === 'tab') opts.tab = parseInt(next(), 10) || 0;
    else if (name === 'dark') opts.dark = true;
    else if (name === 'wait-server') opts.waitServer = parseFloat(next());
    else if (name === 'timeout') opts.timeout = parseInt(next(), 10);
    else if (name === 'json') opts.json = true;
    else if (name === 'help') opts.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!IMPACTS.includes(opts.failOn)) throw new Error(`--fail-on must be one of ${IMPACTS.join(', ')}`);
  if (opts.bestPractices && !opts.tags.includes('best-practice')) opts.tags.push('best-practice');
  opts.urls = opts.urls.map((u) =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(about|data|file):/i.test(u) ? u : `http://${u}`,
  );
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
  else if (type === 'fill') {
    const eq = splitIndex(value);
    if (eq < 1) throw new Error(`--fill expects <selector>=<text>, got "${value}"`);
    await page.locator(value.slice(0, eq)).first().fill(value.slice(eq + 1), { timeout });
  } else if (type === 'wait') {
    if (/^\d+$/.test(value)) await page.waitForTimeout(parseInt(value, 10));
    else await page.locator(value).first().waitFor({ state: 'visible', timeout });
  }
}

// Runs in the page after each Tab press: describe the focused element.
function describeFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { lost: true };
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || '';
  const labelledby = (el.getAttribute('aria-labelledby') || '')
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .map((n) => n.textContent.trim())
    .join(' ');
  const labelFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrapping = el.closest('label');
  const name = (
    el.getAttribute('aria-label') ||
    labelledby ||
    (labelFor && labelFor.textContent) ||
    (wrapping && wrapping.textContent) ||
    (el.innerText || '') ||
    el.getAttribute('title') ||
    el.getAttribute('alt') ||
    el.getAttribute('placeholder') ||
    ''
  ).replace(/\s+/g, ' ').trim().slice(0, 60);
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const shadow = cs.boxShadow && cs.boxShadow !== 'none';
  const r = el.getBoundingClientRect();
  let id = tag;
  if (el.id) id += `#${el.id}`;
  else if (typeof el.className === 'string' && el.className.trim()) id += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
  return {
    lost: false,
    key: id + '|' + Math.round(r.left) + ',' + Math.round(r.top),
    element: id,
    role,
    name,
    offscreen: r.width === 0 || r.height === 0 || r.bottom < 0 || r.right < 0,
    focusStyle: outline || shadow,
  };
}

// ---------------------------------------------------------------------- main

async function auditPage(browser, axeSource, url, width, opts) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    isMobile: width < 768,
    hasTouch: width < 768,
    colorScheme: opts.dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  const result = { url, width, violations: [], incomplete: [], passes: 0, focusOrder: [], focusNotes: [] };
  try {
    await page.goto(url, { timeout: opts.timeout, waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    for (const step of opts.steps) await runStep(page, step, opts.timeout);
    await page.waitForTimeout(300);

    // evaluate() is not subject to the page's CSP, unlike an injected <script>.
    await page.evaluate(axeSource);
    let axeContext = null;
    if (opts.include || opts.exclude.length) {
      axeContext = { exclude: opts.exclude.map((s) => [s]) };
      if (opts.include) axeContext.include = [[opts.include]];
    }
    const axeResults = await page.evaluate(
      async ({ ctx, tags }) => {
        // eslint-disable-next-line no-undef
        const res = await axe.run(ctx || document, {
          runOnly: { type: 'tag', values: tags },
          resultTypes: ['violations', 'incomplete'],
        });
        const slim = (list) =>
          list.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.map((n) => ({
              target: n.target.join(' '),
              summary: (n.failureSummary || '').split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ').trim(),
              html: n.html.slice(0, 160),
            })),
          }));
        return { violations: slim(res.violations), incomplete: slim(res.incomplete), passes: res.passes.length };
      },
      { ctx: axeContext, tags: opts.tags },
    );
    Object.assign(result, axeResults);

    if (opts.tab > 0) {
      const label = (f) =>
        f.lost ? '(focus on <body> — nothing focused)' : `${f.element}${f.role ? ` [role=${f.role}]` : ''} "${f.name}"`;
      if (opts.steps.length) {
        // Keep the focus the steps left behind: after opening a dialog or menu,
        // where focus lands is part of what is being tested.
        result.focusOrder.push(`0. focus after steps: ${label(await page.evaluate(describeFocus))}`);
      } else {
        // Start from the top of the document, like a fresh page load.
        await page.evaluate(() => {
          const start = document.createElement('div');
          start.id = '__a11y_tab_start';
          start.tabIndex = -1;
          start.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px';
          document.body.prepend(start);
          start.focus();
          window.scrollTo(0, 0);
        });
      }
      const seen = new Map();
      let wrapped = false;
      for (let i = 1; i <= opts.tab; i++) {
        await page.keyboard.press('Tab');
        if (i === 1) await page.evaluate(() => document.getElementById('__a11y_tab_start')?.remove());
        const f = await page.evaluate(describeFocus);
        if (f.lost) {
          result.focusOrder.push(`${i}. ${label(f)}`);
          wrapped = true; // end of the page reached; the next Tab starts over
          continue;
        }
        const flags = [];
        if (!f.name) flags.push('NO NAME');
        if (f.offscreen) flags.push('offscreen');
        if (!f.focusStyle) flags.push('no outline/box-shadow on focus — check it is visible');
        result.focusOrder.push(`${i}. ${label(f)}${flags.length ? '  ⚠ ' + flags.join(', ') : ''}`);
        if (seen.has(f.key)) {
          if (!wrapped) {
            result.focusNotes.push(
              `focus cycled back to step ${seen.get(f.key)} without leaving — a focus trap (correct only inside an open modal)`,
            );
          }
          break;
        }
        seen.set(f.key, i);
      }
    }
  } catch (err) {
    result.fatal = err.message.split('\n')[0];
  }
  await context.close();
  return result;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`a11y-audit: ${err.message}\n\n${usage()}`);
    process.exit(2);
  }
  if (opts.help || !opts.urls.length) {
    console.log(usage());
    process.exit(opts.help ? 0 : 2);
  }

  const bases = searchBases();
  const pw = loadPlaywright(bases);
  if (!pw) {
    console.error('a11y-audit: Playwright not found. Install it: npm i -D playwright (or @playwright/test)');
    process.exit(2);
  }
  const axeSource = loadAxeSource(bases);
  if (!axeSource) {
    console.error(
      'a11y-audit: axe-core not found. Install it in the project (npm i -D axe-core), or outside it:\n' +
        '  npm i --prefix /tmp/a11y-tools axe-core && export AXE_CORE_PATH=/tmp/a11y-tools/node_modules/axe-core/axe.min.js',
    );
    process.exit(2);
  }

  try {
    await waitForServer(opts.urls[0], opts.waitServer);
  } catch (err) {
    console.error(`a11y-audit: ${err.message}`);
    process.exit(2);
  }

  let browser;
  try {
    browser = await launchChromium(pw.chromium);
  } catch (err) {
    console.error(`a11y-audit: could not launch Chromium: ${err.message.split('\n')[0]}\n` +
      'Install a browser with "npx playwright install chromium" or point CHROMIUM_PATH at a Chrome/Chromium binary.');
    process.exit(2);
  }

  const results = [];
  for (const url of opts.urls) {
    for (const width of opts.widths) results.push(await auditPage(browser, axeSource, url, width, opts));
  }
  await browser.close();

  const threshold = IMPACTS.indexOf(opts.failOn);
  const failing = results.flatMap((r) => r.violations.filter((v) => IMPACTS.indexOf(v.impact) >= threshold));
  const fatal = results.filter((r) => r.fatal);

  if (opts.json) {
    console.log(JSON.stringify({ failOn: opts.failOn, results }, null, 2));
  } else {
    const lines = [];
    for (const r of results) {
      lines.push(`\n=== ${r.url} @ ${r.width}px${opts.dark ? ' (dark)' : ''}`);
      if (r.fatal) {
        lines.push(`  could not audit: ${r.fatal}`);
        continue;
      }
      const sorted = [...r.violations].sort((a, b) => IMPACTS.indexOf(b.impact) - IMPACTS.indexOf(a.impact));
      lines.push(`  ${r.violations.length} violation type(s), ${r.incomplete.length} need manual review, ${r.passes} rule(s) passed`);
      for (const v of sorted) {
        lines.push(`\n  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'})`);
        lines.push(`    ${v.helpUrl}`);
        for (const n of v.nodes.slice(0, 5)) {
          lines.push(`    • ${n.target}`);
          if (n.summary) lines.push(`      ${n.summary.slice(0, 300)}`);
        }
        if (v.nodes.length > 5) lines.push(`    … ${v.nodes.length - 5} more`);
      }
      if (r.incomplete.length) {
        lines.push(`\n  Needs manual review: ${r.incomplete.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`);
      }
      if (r.focusOrder.length) {
        lines.push('\n  Keyboard focus order:');
        for (const f of r.focusOrder) lines.push(`    ${f}`);
        for (const n of r.focusNotes) lines.push(`    ⚠ ${n}`);
      }
    }
    lines.push(
      failing.length
        ? `\nFAIL: ${failing.length} violation type(s) at or above "${opts.failOn}" across ${results.length} page view(s). Automated rules catch roughly a third of real issues — also check keyboard use, focus and screen-reader names by hand.`
        : `\nPASS: nothing at or above "${opts.failOn}". Automated rules catch only part of real issues — still check keyboard use and focus by hand.`,
    );
    console.log(lines.join('\n'));
  }
  process.exit(fatal.length ? 2 : failing.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`a11y-audit: ${err.stack || err}`);
  process.exit(2);
});
