#!/usr/bin/env node
/*
 * vitals.cjs — lab measurement of a page load in headless Chromium with mobile
 * throttling: TTFB, FCP, LCP (and which element it was), CLS (and what moved),
 * TBT (main-thread blocking, the lab stand-in for INP), bytes by type, the
 * heaviest requests, unused JavaScript, render-blocking files and oversized
 * images.
 *
 *   node vitals.cjs <url> [options]
 *
 * Options
 *   --runs <n>          loads to perform; medians are reported   (default: 3)
 *   --preset <name>     mobile  = 390px, 4x CPU slowdown, slow 4G  (default)
 *                       desktop = 1350px, no CPU slowdown, fast network
 *                       none    = 1350px, no throttling at all
 *   --cpu <factor>      override the CPU slowdown factor
 *   --wait-server <sec> keep retrying until the URL answers (default: 30)
 *   --timeout <ms>      navigation timeout (default: 60000)
 *   --json              print the report as JSON only
 *
 * Measure a production build (e.g. `npm run build && npm run preview`), not the
 * dev server: dev servers ship unbundled, unminified code and skew every number.
 * Lab numbers vary between machines — compare before/after on the same machine.
 *
 * Exit code: 0 = all medians "good", 1 = something needs improvement, 2 = could not run.
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

// ------------------------------------------------------------------- presets

// Network values follow Lighthouse's DevTools throttling (latency x3.75,
// throughput x0.9 to approximate packet-level throttling).
const PRESETS = {
  mobile: {
    viewport: { width: 390, height: 844 },
    mobile: true,
    cpu: 4,
    network: { latency: 562.5, downloadKbps: 1474.56, uploadKbps: 675 },
  },
  desktop: {
    viewport: { width: 1350, height: 940 },
    mobile: false,
    cpu: 1,
    network: { latency: 40, downloadKbps: 10240, uploadKbps: 5120 },
  },
  none: { viewport: { width: 1350, height: 940 }, mobile: false, cpu: 1, network: null },
};

// Thresholds: [good, poor] — Core Web Vitals for LCP/CLS, Lighthouse for TBT.
const THRESHOLDS = {
  ttfb: [800, 1800],
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  tbt: [200, 600],
};

function rate(metric, value) {
  if (value == null) return 'n/a';
  const [good, poor] = THRESHOLDS[metric];
  return value <= good ? 'good' : value <= poor ? 'needs improvement' : 'poor';
}

// ---------------------------------------------------------------------- args

function parseArgs(argv) {
  const opts = { url: null, runs: 3, preset: 'mobile', cpu: null, waitServer: 30, timeout: 60000, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (!arg.startsWith('--')) {
      if (opts.url) throw new Error(`unexpected argument: ${arg}`);
      opts.url = arg;
    } else if (arg === '--runs') opts.runs = Math.max(1, parseInt(next(), 10) || 1);
    else if (arg === '--preset') opts.preset = next();
    else if (arg === '--cpu') opts.cpu = parseFloat(next());
    else if (arg === '--wait-server') opts.waitServer = parseFloat(next());
    else if (arg === '--timeout') opts.timeout = parseInt(next(), 10);
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help') opts.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!PRESETS[opts.preset]) throw new Error(`--preset must be one of ${Object.keys(PRESETS).join(', ')}`);
  if (opts.url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(opts.url)) opts.url = `http://${opts.url}`;
  return opts;
}

function usage() {
  const text = fs.readFileSync(__filename, 'utf8').split('\n');
  const start = text.findIndex((l) => l.startsWith('/*'));
  const end = text.findIndex((l) => l.startsWith(' */'));
  return text.slice(start + 1, end).map((l) => l.replace(/^ \* ?/, '')).join('\n');
}

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
  throw new Error(`nothing answered at ${url} within ${seconds}s (${reason}). Is the server running?`);
}

// ----------------------------------------------------------- in-page probes

// Installed before any page script runs, so buffered entries are not missed.
function installObservers() {
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return node && node.parentElement ? describe(node.parentElement) : null;
    let s = node.tagName.toLowerCase();
    if (node.id) s += `#${node.id}`;
    else if (typeof node.className === 'string' && node.className.trim()) {
      s += '.' + node.className.trim().split(/\s+/).slice(0, 3).join('.');
    }
    if (node.tagName === 'IMG') s += ` src=${(node.currentSrc || node.src || '').split('/').pop().slice(0, 60)}`;
    return s;
  };
  const perf = (window.__perf = { lcp: null, lcpElement: null, lcpUrl: null, lcpLazy: false, shifts: [], longTasks: [] });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perf.lcp = e.startTime;
        perf.lcpElement = describe(e.element);
        perf.lcpUrl = e.url || null;
        perf.lcpLazy = !!(e.element && e.element.getAttribute && e.element.getAttribute('loading') === 'lazy');
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        perf.shifts.push({
          value: e.value,
          time: e.startTime,
          sources: (e.sources || []).map((s) => describe(s.node)).filter(Boolean).slice(0, 3),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
}

function collectPageData() {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const dpr = window.devicePixelRatio || 1;
  const oversized = [...document.images]
    .filter((img) => img.naturalWidth && img.clientWidth && img.naturalWidth > img.clientWidth * dpr * 1.5)
    .slice(0, 8)
    .map((img) => ({
      src: (img.currentSrc || img.src).slice(0, 120),
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      displayed: `${img.clientWidth}x${img.clientHeight}`,
    }));
  const imagesWithoutSize = [...document.images].filter(
    (img) => !img.getAttribute('width') && !img.getAttribute('height') && !img.style.aspectRatio,
  ).length;
  const renderBlocking = performance
    .getEntriesByType('resource')
    .filter((r) => r.renderBlockingStatus === 'blocking')
    .map((r) => r.name);
  return {
    ttfb: nav ? nav.responseStart : null,
    fcp: fcp ? fcp.startTime : null,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
    load: nav ? nav.loadEventEnd : null,
    domElements: document.getElementsByTagName('*').length,
    oversized,
    imagesWithoutSize,
    renderBlocking,
    perf: window.__perf,
  };
}

// ------------------------------------------------------------------ analysis

// CLS = largest "session window" of shifts (gap < 1s, window < 5s).
function computeCls(shifts) {
  let best = { value: 0, shifts: [] };
  let current = { value: 0, shifts: [] };
  for (const s of shifts) {
    const first = current.shifts[0];
    const last = current.shifts[current.shifts.length - 1];
    if (first && (s.time - last.time > 1000 || s.time - first.time > 5000)) current = { value: 0, shifts: [] };
    current.value += s.value;
    current.shifts.push(s);
    if (current.value > best.value) best = { value: current.value, shifts: [...current.shifts] };
  }
  return best;
}

// Unused bytes from V8 block coverage: paint outer ranges first, inner ranges override.
function unusedBytes(entry) {
  const length = entry.source ? entry.source.length : 0;
  if (!length) return null;
  const used = new Uint8Array(length);
  const ranges = entry.functions.flatMap((f) => f.ranges);
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) used.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, length));
  let count = 0;
  for (let i = 0; i < length; i++) count += used[i];
  return { total: length, unused: length - count };
}

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const ms = (x) => (x == null ? 'n/a' : `${Math.round(x)} ms`);

async function measureOnce(browser, opts, preset) {
  const context = await browser.newContext({
    viewport: preset.viewport,
    isMobile: preset.mobile,
    hasTouch: preset.mobile,
    deviceScaleFactor: preset.mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (preset.network) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: preset.network.latency,
      downloadThroughput: (preset.network.downloadKbps * 1024) / 8,
      uploadThroughput: (preset.network.uploadKbps * 1024) / 8,
    });
  }
  const cpu = opts.cpu || preset.cpu;
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  const requests = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!requests.has(e.requestId)) {
      requests.set(e.requestId, { url: e.request.url, type: e.type, status: null, bytes: 0, done: false });
    }
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, { url: e.response.url, type: e.type, status: e.response.status });
  });
  cdp.on('Network.dataReceived', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.bytes += e.encodedDataLength;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, { bytes: e.encodedDataLength, done: true });
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.done = true;
  });

  await page.addInitScript(installObservers);
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  const response = await page.goto(opts.url, { waitUntil: 'load', timeout: opts.timeout });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500); // late layout shifts and LCP candidates
  const coverage = await page.coverage.stopJSCoverage();
  const data = await page.evaluate(collectPageData);
  await context.close();

  const cls = computeCls(data.perf.shifts);
  const fcp = data.fcp;
  const blocking = (tasks) => tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
  const tbt = blocking(data.perf.longTasks.filter((t) => fcp == null || t.start >= fcp));
  const blockingBeforeFcp = fcp == null ? 0 : blocking(data.perf.longTasks.filter((t) => t.start < fcp));

  const list = [...requests.values()];
  const byType = {};
  for (const r of list) {
    const key = r.type || 'Other';
    byType[key] = byType[key] || { count: 0, bytes: 0 };
    byType[key].count++;
    byType[key].bytes += r.bytes;
  }
  const js = coverage
    .map((c) => ({ url: c.url, ...(unusedBytes(c) || {}) }))
    .filter((c) => c.total && /^https?:/.test(c.url));

  return {
    status: response ? response.status() : null,
    ttfb: data.ttfb,
    fcp,
    lcp: data.perf.lcp,
    lcpElement: data.perf.lcpElement,
    lcpUrl: data.perf.lcpUrl,
    lcpLazy: data.perf.lcpLazy,
    cls: cls.value,
    clsSources: [...new Set(cls.shifts.flatMap((s) => s.sources))].slice(0, 5),
    tbt,
    blockingBeforeFcp,
    longTasks: data.perf.longTasks.length,
    longestTasks: [...data.perf.longTasks].sort((a, b) => b.duration - a.duration).slice(0, 3),
    unfinished: list.filter((r) => !r.done).map((r) => r.url),
    load: data.load,
    domElements: data.domElements,
    requests: list.length,
    totalBytes: list.reduce((s, r) => s + r.bytes, 0),
    byType,
    heaviest: list.sort((a, b) => b.bytes - a.bytes).slice(0, 6).map((r) => ({ url: r.url, type: r.type, bytes: r.bytes })),
    unusedJs: js.sort((a, b) => b.unused - a.unused).slice(0, 5),
    renderBlocking: data.renderBlocking,
    oversizedImages: data.oversized,
    imagesWithoutSize: data.imagesWithoutSize,
  };
}

// ---------------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`vitals: ${err.message}\n\n${usage()}`);
    process.exit(2);
  }
  if (opts.help || !opts.url) {
    console.log(usage());
    process.exit(opts.help ? 0 : 2);
  }
  const pw = loadPlaywright();
  if (!pw) {
    console.error('vitals: Playwright not found. Install it: npm i -D playwright (or @playwright/test)');
    process.exit(2);
  }
  try {
    await waitForServer(opts.url, opts.waitServer);
  } catch (err) {
    console.error(`vitals: ${err.message}`);
    process.exit(2);
  }
  let browser;
  try {
    browser = await launchChromium(pw.chromium);
  } catch (err) {
    console.error(`vitals: could not launch Chromium: ${err.message.split('\n')[0]}\n` +
      'Install a browser with "npx playwright install chromium" or point CHROMIUM_PATH at a Chrome/Chromium binary.');
    process.exit(2);
  }

  const preset = PRESETS[opts.preset];
  const runs = [];
  try {
    for (let i = 0; i < opts.runs; i++) runs.push(await measureOnce(browser, opts, preset));
  } catch (err) {
    await browser.close();
    console.error(`vitals: measurement failed: ${err.message.split('\n')[0]}`);
    process.exit(2);
  }
  await browser.close();

  const summary = {};
  for (const m of ['ttfb', 'fcp', 'lcp', 'cls', 'tbt']) {
    const value = median(runs.map((r) => r[m]));
    summary[m] = { value, rating: rate(m, value) };
  }
  // Details come from the run whose LCP is closest to the median.
  const target = summary.lcp.value;
  const detail = [...runs].sort((a, b) => Math.abs((a.lcp ?? 0) - target) - Math.abs((b.lcp ?? 0) - target))[0];

  const hints = [];
  if (detail.unfinished.length) {
    hints.push(`${detail.unfinished.length} request(s) were still loading when measurement stopped — LCP/bytes are underestimated; the page is too heavy for this network.`);
  }
  if (detail.blockingBeforeFcp > 100) {
    hints.push(`${ms(detail.blockingBeforeFcp)} of main-thread blocking happened before first paint — it delays FCP/LCP (not counted in TBT).`);
  }
  if (detail.lcpLazy) hints.push('The LCP image has loading="lazy" — remove it and add fetchpriority="high".');
  if (detail.lcpUrl && !detail.lcpLazy && summary.lcp.rating !== 'good') {
    hints.push('LCP is an image: make sure it is discoverable in the HTML (not injected by JS), sized correctly, modern format, fetchpriority="high".');
  }
  if (detail.renderBlocking.length) hints.push(`${detail.renderBlocking.length} render-blocking file(s) delay first paint (see list).`);
  if (detail.oversizedImages.length) hints.push(`${detail.oversizedImages.length} image(s) are much larger than displayed — serve responsive sizes (srcset/sizes).`);
  if (detail.imagesWithoutSize) hints.push(`${detail.imagesWithoutSize} <img> without width/height or aspect-ratio — a common CLS source.`);
  const unusedJs = detail.unusedJs.reduce((s, c) => s + c.unused, 0);
  if (unusedJs > 100 * 1024) {
    hints.push(
      `${kb(unusedJs)} of JavaScript is downloaded but not executed during load. Part of it is framework code that runs later; ` +
        'find your own heavy modules/libraries with a bundle analyzer and lazy-load them with dynamic import().',
    );
  }
  if (summary.tbt.rating !== 'good') hints.push('Long main-thread tasks block input (hurts INP): split work, defer non-critical scripts, avoid big synchronous renders.');
  if (detail.domElements > 1500) hints.push(`${detail.domElements} DOM elements — large DOMs slow style/layout; virtualize long lists.`);

  const report = { url: opts.url, preset: opts.preset, cpuSlowdown: opts.cpu || preset.cpu, runs: runs.length, summary, detail, hints };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const L = [];
    L.push(`vitals ${opts.url}  [preset: ${opts.preset}, CPU x${report.cpuSlowdown}, ${runs.length} run(s), medians]`);
    L.push(`  TTFB ${ms(summary.ttfb.value).padEnd(9)} ${summary.ttfb.rating}`);
    L.push(`  FCP  ${ms(summary.fcp.value).padEnd(9)} ${summary.fcp.rating}`);
    L.push(`  LCP  ${ms(summary.lcp.value).padEnd(9)} ${summary.lcp.rating}   element: ${detail.lcpElement || 'n/a'}`);
    L.push(`  CLS  ${(summary.cls.value == null ? 'n/a' : summary.cls.value.toFixed(3)).padEnd(9)} ${summary.cls.rating}${detail.clsSources.length ? `   moved: ${detail.clsSources.join(', ')}` : ''}`);
    L.push(`  TBT  ${ms(summary.tbt.value).padEnd(9)} ${summary.tbt.rating}   (lab proxy for INP; ${detail.longTasks} long task(s)${detail.longestTasks.length ? `, longest ${detail.longestTasks.map((t) => `${Math.round(t.duration)}ms@${Math.round(t.start)}`).join(', ')}` : ''})`);
    L.push(`\n  ${detail.requests} requests, ${kb(detail.totalBytes)} transferred, ${detail.domElements} DOM elements`);
    for (const [type, v] of Object.entries(detail.byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
      L.push(`    ${type.padEnd(12)} ${String(v.count).padStart(3)} × ${kb(v.bytes)}`);
    }
    L.push('\n  Heaviest requests:');
    for (const r of detail.heaviest) L.push(`    ${kb(r.bytes).padStart(10)}  ${r.type || ''}  ${r.url.slice(0, 110)}`);
    if (detail.unusedJs.length) {
      L.push('\n  Unused JavaScript during load:');
      for (const c of detail.unusedJs) {
        L.push(`    ${kb(c.unused).padStart(10)} of ${kb(c.total)} (${Math.round((c.unused / c.total) * 100)}%)  ${c.url.slice(0, 100)}`);
      }
    }
    if (detail.unfinished.length) {
      L.push('\n  Still loading when measurement stopped:');
      for (const u of detail.unfinished.slice(0, 8)) L.push(`    ${u.slice(0, 120)}`);
    }
    if (detail.renderBlocking.length) {
      L.push('\n  Render-blocking:');
      for (const u of detail.renderBlocking.slice(0, 8)) L.push(`    ${u.slice(0, 120)}`);
    }
    if (detail.oversizedImages.length) {
      L.push('\n  Oversized images (natural vs displayed):');
      for (const i of detail.oversizedImages) L.push(`    ${i.natural} shown at ${i.displayed}  ${i.src}`);
    }
    if (hints.length) L.push(`\n  Hints:\n    - ${hints.join('\n    - ')}`);
    console.log(L.join('\n'));
  }
  const allGood =
    !detail.unfinished.length && Object.values(summary).every((m) => m.rating === 'good' || m.rating === 'n/a');
  process.exit(allGood ? 0 : 1);
}

main().catch((err) => {
  console.error(`vitals: ${err.stack || err}`);
  process.exit(2);
});
