# Tailwind CSS v3 → v4 differences

Verified against Tailwind CSS 4.3. For a real migration run `npx @tailwindcss/upgrade`
on a clean git tree first, then use this list to review the diff and fix what the
codemod can't know (dynamic class strings, component libraries, visual defaults).

## Renamed utilities (the scale shifted down one step)

| v3 | v4 |
|---|---|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `drop-shadow-sm` | `drop-shadow-xs` |
| `drop-shadow` | `drop-shadow-sm` |
| `blur-sm` | `blur-xs` |
| `blur` | `blur-sm` |
| `backdrop-blur-sm` | `backdrop-blur-xs` |
| `backdrop-blur` | `backdrop-blur-sm` |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |
| `outline-none` | `outline-hidden` (v4 `outline-none` really sets `outline-style: none`) |
| `ring` (3px) | `ring-3` (v4 `ring` is 1px) |

Because the old names still exist with different values, nothing errors — the UI
just gets subtly smaller shadows, radii and blurs. Check these first when "the
design looks slightly off" after an upgrade.

## Removed utilities

| v3 | v4 |
|---|---|
| `bg-opacity-50`, `text-opacity-*`, `border-opacity-*`, `divide-opacity-*`, `ring-opacity-*`, `placeholder-opacity-*` | opacity modifier: `bg-black/50`, `text-white/80` |

## Deprecated aliases (still compile, prefer the new name)

| v3 | v4 |
|---|---|
| `flex-shrink-0`, `flex-grow` | `shrink-0`, `grow` |
| `overflow-ellipsis` | `text-ellipsis` |
| `decoration-slice`, `decoration-clone` | `box-decoration-slice`, `box-decoration-clone` |
| `bg-gradient-to-r` | `bg-linear-to-r` (also `bg-linear-45`, `bg-radial`, `bg-conic`) |
| `!font-bold` (leading `!`) | `font-bold!` (trailing `!`) |

## Changed defaults

- **Border color** is `currentColor` (v3: gray-200). Write `border border-gray-200`
  (or a semantic `border-border`) explicitly.
- **Ring** is 1px `currentColor` (v3: 3px blue-500). Focus rings need an explicit
  width and color: `focus-visible:ring-2 focus-visible:ring-primary`.
- **Placeholder text** uses the current text color at 50% opacity (v3: gray-400).
- **Buttons** get `cursor: default` like the browser (v3 preflight set `pointer`).
  Add `cursor-pointer` where wanted, or a base rule.
- **`hover:`** only applies where the primary input can hover (`@media (hover: hover)`),
  so taps on touch screens no longer leave sticky hover styles.
- **`space-x/y-*` and `divide-*`** use a different selector (margin on
  `:not(:last-child)`), which can change layouts with inline children. Prefer
  `gap-*` on flex/grid containers.
- **Stacked variants apply left to right**: v3 `first:*:pt-0` becomes `*:first:pt-0`.
- **Arbitrary CSS variables** use parentheses: `bg-[--brand]` → `bg-(--brand)`.

## Config → CSS

| v3 (`tailwind.config.js`) | v4 (CSS) |
|---|---|
| `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` |
| `content: ['./src/**/*.{ts,tsx}']` | automatic; add `@source "…";` for extra paths, `@source not "…";` to exclude |
| `safelist: ['bg-red-500']` | `@source inline("bg-red-500");` (brace expansion works: `bg-red-{100,500}`) |
| `darkMode: 'class'` | `@custom-variant dark (&:where(.dark, .dark *));` |
| `darkMode: ['class', '[data-theme="dark"]']` | `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` |
| `theme.extend.colors.brand[500] = '#…'` | `@theme { --color-brand-500: #…; }` |
| `theme.colors = {…}` (replace all) | `@theme { --color-*: initial; --color-…: …; }` |
| `theme.extend.fontFamily.display` | `@theme { --font-display: …; }` |
| `theme.extend.screens['3xl']` | `@theme { --breakpoint-3xl: 120rem; }` |
| `theme.extend.keyframes` + `animation` | `@theme { --animate-x: x 1s …; @keyframes x { … } }` |
| `plugins: [require('@tailwindcss/typography')]` | `@plugin "@tailwindcss/typography";` |
| `@layer utilities { .content-auto { … } }` | `@utility content-auto { … }` |
| `theme('colors.red.500')` in CSS | `var(--color-red-500)` |
| `prefix: 'tw-'` | `@import "tailwindcss" prefix(tw);` → classes `tw:flex` |
| `container: { center: true, padding: '2rem' }` | `@utility container { margin-inline: auto; padding-inline: 2rem; }` |
| keep a JS config during migration | `@config "./tailwind.config.js";` |

## Tooling

- Vite: `@tailwindcss/vite` plugin. PostCSS: `@tailwindcss/postcss` (remove
  `autoprefixer` and `postcss-import`; v4 handles both). CLI: `@tailwindcss/cli`.
- Sass/Less/Stylus aren't supported as preprocessors for Tailwind v4 files — v4 is
  the preprocessor.
- Browser support: Safari 16.4+, Chrome 111+, Firefox 128+ (v4 relies on cascade
  layers, `@property` and `color-mix()`). If older browsers are a requirement, stay
  on v3.4.
- `tailwind-merge` v3 is for Tailwind v4; v2.x is for v3.
- `prettier-plugin-tailwindcss` needs to know the CSS entry in v4:
  `"tailwindStylesheet": "./src/index.css"` in the Prettier config.
