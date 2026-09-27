---
name: web-performance
description: Measure and improve frontend performance with numbers instead of guesses — Core Web Vitals (LCP, INP, CLS), JavaScript bundle size, images, fonts, render-blocking resources and React re-renders. A bundled Playwright script measures a throttled mobile page load and reports the LCP element, layout-shift sources, long tasks, bytes by type, unused JavaScript, render-blocking files and oversized images, so every fix can be compared before and after. Use this whenever the user says a site or app is slow, janky or heavy, has a poor Lighthouse or PageSpeed score, wants to optimize load time, bundle size, images or fonts, mentions Core Web Vitals, LCP, INP or CLS, or before launching a public page.
---

# Web performance

Performance work goes wrong when it's based on hunches. The loop is:
**measure → find the biggest bottleneck → fix one thing → measure again with the
same settings → report the difference.**

## 1. Measure a production build

Dev servers ship unbundled, unminified code with extra tooling, so their numbers
are meaningless. Build and serve the real thing:

- Vite: `npm run build && npm run preview` → http://localhost:4173
- Next.js: `npm run build && npm run start` → http://localhost:3000
- Static output: `npx serve dist` (or `out/`, `build/`)

Run the servers in the background and stop them afterwards.

## 2. Lab measurement (bundled script)

`scripts/vitals.cjs` is in this skill's directory (the folder containing this
SKILL.md). It uses Playwright and any available Chromium.

```bash
node <skill-dir>/scripts/vitals.cjs http://localhost:4173              # mobile: 4x CPU slowdown, slow 4G, 3 runs
node <skill-dir>/scripts/vitals.cjs http://localhost:4173 --runs 1     # quick check
node <skill-dir>/scripts/vitals.cjs http://localhost:4173 --preset desktop
node <skill-dir>/scripts/vitals.cjs http://localhost:4173/pricing --json > /tmp/before.json
```

It reports medians of TTFB, FCP, LCP, CLS and TBT with ratings, and details from a
typical run: the LCP element, which elements moved (CLS), the longest tasks,
requests and bytes by type, the heaviest requests, JavaScript that was downloaded
but not executed during load, render-blocking files, oversized images, `<img>`
without dimensions, requests still loading when measurement stopped — plus hints.
Exit code 0 = all metrics "good", 1 = something to improve, 2 = couldn't run.

| Metric | Good | Poor | What it means |
|---|---|---|---|
| LCP | ≤ 2.5 s | > 4 s | when the main content appears |
| INP (field) / TBT (lab) | ≤ 200 ms | > 500 ms INP, > 600 ms TBT | how quickly the page reacts to input |
| CLS | ≤ 0.1 | > 0.25 | how much content jumps around |
| FCP | ≤ 1.8 s | > 3 s | first text/image on screen |
| TTFB | ≤ 0.8 s | > 1.8 s | server/network response time |

Lab numbers depend on the machine; compare before/after on the same machine and
settings, and treat absolute values as indicative. INP needs real interactions, so
the lab uses TBT (main-thread blocking) as its proxy.

**Optional cross-check with Lighthouse** (downloads the CLI on first run):

```bash
npx lighthouse http://localhost:4173 --only-categories=performance --form-factor=mobile \
  --quiet --chrome-flags="--headless=new" --output=json --output-path=/tmp/lh.json
```

Set `CHROME_PATH` to a Chrome/Chromium binary if none is installed system-wide.
Read `audits` in the JSON for specific opportunities.

**What's in the bundle:** build with source maps and inspect —
`npx vite build --sourcemap && npx source-map-explorer 'dist/assets/*.js' --no-border-checks`
(Vite), or `@next/bundle-analyzer` for Next.js. `rollup-plugin-visualizer` works with
Vite (Rollup and Rolldown) for an interactive treemap.

**Real users (field data):** lab tests can't see real devices and networks. For
public sites check PageSpeed Insights / CrUX, and report from the app itself:

```ts
import { onCLS, onINP, onLCP } from 'web-vitals'

const send = (metric: { name: string; value: number; id: string }) =>
  navigator.sendBeacon('/analytics/vitals', JSON.stringify(metric))
onCLS(send)
onINP(send)
onLCP(send)
```

## 3. Fix by metric

Pick the fixes that match what the measurement shows. Code for each is in
`references/fixes.md`.

**LCP (slow main content)**
- LCP image: must be in the initial HTML (not injected by JS), not
  `loading="lazy"`, with `fetchpriority="high"`, correctly sized (`srcset` +
  `sizes`), in AVIF/WebP. CSS background images as LCP need a `<link rel="preload">`.
- LCP text: fonts shouldn't hide text — `font-display: swap` (or `optional`),
  preload the one font file used above the fold, self-host.
- Render-blocking CSS/JS in `<head>`: keep CSS small, defer non-critical scripts.
- Client-rendered SPAs paint content only after JS downloads and runs; for landing
  pages and SEO pages prefer SSR/SSG (Next.js, Astro) or prerendering.
- Slow TTFB: cache HTML at a CDN, avoid slow server work before first byte, use
  streaming SSR.

**CLS (layout jumps)**
- Give every image, video and iframe `width` + `height` (or `aspect-ratio`).
- Reserve space for content that loads later (banners, ads, embeds, lists) —
  skeletons with the final size.
- Don't insert content above what the user is reading; show notices as overlays.
- Fonts: matching fallback metrics (`size-adjust`, `ascent-override`; `next/font`
  and Fontsource do this) so the swap doesn't reflow text.
- Animate `transform`/`opacity`, not `top`, `left`, `width`, `height`.

**INP / TBT (slow reactions)**
- Break up long tasks: yield to the browser between chunks of work
  (`await scheduler.yield()` where available, otherwise `setTimeout(0)`).
- Keep input handlers light; move heavy computation to a Web Worker.
- React: `useTransition` / `useDeferredValue` for expensive updates caused by
  typing, virtualize long lists, avoid re-rendering big trees on every keystroke
  (see the **react-typescript** skill), reduce hydration cost with Server
  Components or islands.
- Third-party scripts (chat, analytics, A/B testing) are frequent culprits: load
  them `async`/`defer`, after interaction, or behind a facade.

**JavaScript size**
- Split by route (`lazy(() => import('./pages/Settings'))`) and load heavy widgets
  (charts, editors, maps, date pickers) on demand.
- Check what dominates the bundle and replace heavyweight dependencies (e.g.
  moment → `Intl` / date-fns, full lodash → native or per-function imports).
- Import only what you use; make sure nothing pulls a whole icon set or locale
  bundle.
- Set a budget and check it in CI (e.g. size-limit), so regressions are caught.

**Images and fonts**
- Serve responsive sizes and modern formats; `loading="lazy"` + `decoding="async"`
  below the fold; framework components (`next/image`, Astro `<Image>`) do most of
  this.
- Fonts: fewer families and weights, variable fonts, WOFF2, subsets, preload only
  what's above the fold.

**Delivery**
- Hashed static assets: `Cache-Control: public, max-age=31536000, immutable`;
  HTML: short or no cache.
- Brotli/gzip compression, HTTP/2+, a CDN; `preconnect` to critical third-party
  origins.

## 4. Report

Show a before/after table (same URL, preset and number of runs), what changed and
why, and the next biggest opportunity. If a number got worse, say so.

```
| Metric | Before | After |
|--------|--------|-------|
| LCP    | 4.8 s  | 2.1 s |
| CLS    | 0.21   | 0.02  |
| TBT    | 640 ms | 180 ms|
| JS     | 412 KB | 236 KB|
```

## References

- `references/fixes.md` — code for responsive/priority images, font loading, route
  and component code splitting, yielding long tasks, deferring third-party scripts,
  reserving space, caching headers, and Next.js specifics.
