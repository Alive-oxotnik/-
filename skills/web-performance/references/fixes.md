# Performance fixes — code

Contents
1. LCP image
2. Responsive images below the fold
3. Fonts
4. Code splitting (routes, heavy widgets, on interaction)
5. Yielding long tasks
6. Third-party scripts
7. Reserving space (CLS)
8. Caching headers
9. React rendering
10. Next.js specifics

---

## 1. LCP image

```html
<img
  src="/hero-1200.avif"
  srcset="/hero-640.avif 640w, /hero-960.avif 960w, /hero-1200.avif 1200w, /hero-1920.avif 1920w"
  sizes="(min-width: 64rem) 50vw, 100vw"
  width="1200" height="800"
  alt="…"
  fetchpriority="high"
  decoding="async"
/>
```

- No `loading="lazy"` on the LCP image (lazy images wait for layout before loading).
- When the LCP element is a CSS background or is rendered by JS, let the browser
  find it early:
  `<link rel="preload" as="image" href="/hero-1200.avif" imagesrcset="…" imagesizes="…" fetchpriority="high">`
- Generate sizes/formats at build time (`sharp`, `vite-imagetools`, framework image
  components) or through an image CDN rather than shipping the original file.

## 2. Responsive images below the fold

```html
<picture>
  <source type="image/avif" srcset="/card-400.avif 400w, /card-800.avif 800w" sizes="(min-width: 48rem) 33vw, 100vw" />
  <source type="image/webp" srcset="/card-400.webp 400w, /card-800.webp 800w" sizes="(min-width: 48rem) 33vw, 100vw" />
  <img src="/card-800.jpg" width="800" height="600" alt="…" loading="lazy" decoding="async" />
</picture>
```

`sizes` must describe the rendered width; with a wrong `sizes` the browser downloads
the largest file anyway.

## 3. Fonts

```css
/* Self-hosted variable font: one file for all weights */
@font-face {
  font-family: "Inter Variable";
  src: url("/fonts/inter-latin-var.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F; /* Latin subset */
}

/* Fallback tuned to the web font's metrics → no reflow when it swaps in */
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  size-adjust: 107%;
  ascent-override: 90%;
}

body { font-family: "Inter Variable", "Inter Fallback", system-ui, sans-serif; }
```

```html
<link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin />
```

- Preload only the file(s) used above the fold; preloading everything competes
  with the LCP image.
- `npm i @fontsource-variable/inter` + `import '@fontsource-variable/inter'` gives
  self-hosted files with subsets; in Next.js use `next/font`, which also generates
  the metric-adjusted fallback. The `size-adjust` numbers above are illustrative —
  compute real ones with a tool (e.g. Fontaine/Capsize) or let the framework do it.
- Cyrillic text needs the Cyrillic subset (`U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116`).

## 4. Code splitting

```tsx
import { lazy, Suspense } from 'react'

// route level
const Settings = lazy(() => import('./pages/Settings'))

<Suspense fallback={<PageSkeleton />}>
  <Settings />
</Suspense>
```

```tsx
// heavy widget loaded only when needed
const Chart = lazy(() => import('./RevenueChart'))

function Report({ showChart }: { showChart: boolean }) {
  return showChart ? (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" />}>
      <Chart />
    </Suspense>
  ) : null
}
```

```ts
// library loaded on interaction, and prefetched on hover/focus
let confettiPromise: Promise<typeof import('canvas-confetti')> | undefined
const loadConfetti = () => (confettiPromise ??= import('canvas-confetti'))

button.addEventListener('pointerenter', loadConfetti, { once: true })
button.addEventListener('click', async () => {
  const { default: confetti } = await loadConfetti()
  confetti()
})
```

Give lazy regions a fallback with the final size, or splitting trades JS for CLS.

## 5. Yielding long tasks

```ts
// Process a big array without blocking input for hundreds of milliseconds.
function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (s?.yield) return s.yield()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function processInChunks<T>(items: T[], work: (item: T) => void, budgetMs = 40) {
  let start = performance.now()
  for (const item of items) {
    work(item)
    if (performance.now() - start > budgetMs) {
      await yieldToMain()
      start = performance.now()
    }
  }
}
```

For CPU-heavy work (parsing, image processing, search indexes) move it to a Web
Worker: `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
works in Vite and Next.js.

## 6. Third-party scripts

```html
<!-- doesn't block parsing; runs after the document is parsed -->
<script src="https://example-analytics.com/a.js" defer></script>
```

```ts
// load a chat widget only after the user shows intent, or when the browser is idle
const loadChat = () => import('./chat-widget').then((m) => m.init())
document.querySelector('#chat-button')?.addEventListener('click', loadChat, { once: true })
// or: requestIdleCallback?.(() => loadChat())
```

A facade (a static button/image that looks like the widget and loads the real one on
click) works well for chat, video embeds and maps.

## 7. Reserving space (CLS)

```css
.video-embed { aspect-ratio: 16 / 9; width: 100%; }
.ad-slot { min-height: 250px; }
```

```tsx
// skeleton with the same size as the loaded content
{isPending ? <div className="h-24 rounded-lg bg-muted" aria-busy="true" /> : <UserCard user={user} />}
```

Late banners (cookie notices, promos) should overlay the page (`position: fixed`)
instead of pushing content down.

## 8. Caching headers

```
# hashed build assets: /assets/index-C9STZPxb.js
Cache-Control: public, max-age=31536000, immutable
# HTML
Cache-Control: no-cache
```

Enable Brotli or gzip on the server/CDN. Hosting platforms (Vercel, Netlify,
Cloudflare Pages) set these for framework output automatically; custom servers
(nginx, Express static) need it configured.

## 9. React rendering

- Find what re-renders: React DevTools Profiler ("Highlight updates when components
  render"), then fix the cause rather than sprinkling `memo`.
- Common causes: state stored too high (move it down), a context value recreated on
  every render (memoize or split the context), new inline objects passed to memoized
  children, big lists rendered in full (virtualize with `@tanstack/react-virtual`),
  expensive derived data recomputed each render (`useMemo`, or React Compiler).
- Keep typing responsive: `const deferredQuery = useDeferredValue(query)` and render
  the expensive list from `deferredQuery`.

## 10. Next.js specifics

- `next/image` for responsive, lazy, modern-format images; add `priority` (or
  `preload` in newer versions — check `node_modules/next/dist/docs/`) to the LCP
  image.
- `next/font` for self-hosted fonts with automatic fallback metrics.
- `next/dynamic` for client-only heavy components; keep `'use client'` boundaries
  small so most of the tree stays server-rendered and ships no JS.
- `next/script` with `strategy="lazyOnload"` or `"afterInteractive"` for
  third-party scripts.
- `next build` prints per-route JS sizes; `@next/bundle-analyzer` shows what's
  inside.
