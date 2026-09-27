---
name: tailwind-css
description: Style interfaces with Tailwind CSS the v4 way and avoid the v3 habits that silently break it — CSS-first config with @import "tailwindcss" and @theme, semantic design tokens for light/dark themes (@theme inline), class-based dark mode with @custom-variant, @utility and @source, renamed utilities (shadow-xs, rounded-xs, outline-hidden, ring-3, bg-black/50 instead of bg-opacity), responsive and container queries, and clean class composition with cn() (clsx + tailwind-merge) and variant maps. Use this whenever you write or edit Tailwind classes, set up or migrate Tailwind, build a theme, color palette or dark mode, or when "a Tailwind class doesn't work" — and in any project with tailwindcss in package.json.
---

# Tailwind CSS

## 1. Know which Tailwind you're writing for

Run `npm ls tailwindcss` and look at the CSS entry file before touching classes.

| v4 (current) | v3 (legacy) |
|---|---|
| `@import "tailwindcss";` in CSS | `@tailwind base; @tailwind components; @tailwind utilities;` |
| theme in CSS: `@theme { … }` | theme in `tailwind.config.js` |
| `@tailwindcss/vite`, `@tailwindcss/postcss` or `@tailwindcss/cli` | `tailwindcss` PostCSS plugin + `content: [...]` |
| sources detected automatically | `content` globs required |

Write for the installed version and don't mix syntaxes. Models tend to produce v3
config and class names from memory — that is the main source of "Tailwind isn't
working". To migrate a v3 project, run the official codemod on a clean git tree and
review the diff: `npx @tailwindcss/upgrade`. Renames and removed utilities are listed
in `references/v3-to-v4.md`.

## 2. Setup (v4)

- Vite: `npm i -D tailwindcss @tailwindcss/vite`, add `tailwindcss()` to `plugins`.
- Next.js / other PostCSS setups: `@tailwindcss/postcss` in `postcss.config.mjs`.
- CSS entry: `@import "tailwindcss";` — no config file needed.
- Legacy JS config still loads if you ask for it: `@config "../tailwind.config.js";`.

## 3. Design tokens with `@theme`

Theme variables live in CSS and generate utilities from their namespace:

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Fraunces", ui-serif, Georgia, serif;   /* → font-display */
  --color-brand-50: oklch(0.97 0.02 250);                 /* → bg-brand-50, text-brand-50, … */
  --color-brand-500: oklch(0.62 0.19 250);
  --color-brand-900: oklch(0.30 0.10 250);
  --radius-card: 0.875rem;                                /* → rounded-card */
  --breakpoint-3xl: 120rem;                               /* → 3xl: */
  --animate-fade-in: fade-in 200ms ease-out;              /* → animate-fade-in */
  @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
}
```

Namespaces: `--color-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--tracking-*`,
`--leading-*`, `--spacing`, `--radius-*`, `--shadow-*`, `--inset-shadow-*`,
`--drop-shadow-*`, `--blur-*`, `--breakpoint-*`, `--container-*`, `--ease-*`,
`--animate-*`. Reset a whole default namespace with `--color-*: initial;` when the
project should only use its own palette. Every token is also a CSS variable
(`var(--color-brand-500)`) for use in custom CSS, inline styles or JS.

Prefer OKLCH for palettes: equal lightness steps look equally light across hues,
which makes consistent scales and contrast easier.

## 4. Semantic tokens and dark mode

Components should use roles (`bg-surface`, `text-muted-foreground`, `border-border`),
not raw palette steps. Then theming (dark mode, brands) is one CSS change instead of
`dark:` variants on every element.

```css
@import "tailwindcss";

/* Toggle with a class on <html>; delete this line to follow the OS setting instead. */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: oklch(0.99 0 0);
  --foreground: oklch(0.21 0.02 260);
  --surface: oklch(1 0 0);
  --muted: oklch(0.96 0.01 260);
  --muted-foreground: oklch(0.50 0.02 260);
  --border: oklch(0.91 0.01 260);
  --primary: oklch(0.55 0.20 262);
  --primary-foreground: oklch(0.99 0 0);
  --danger: oklch(0.58 0.22 27);
}

.dark {
  --background: oklch(0.17 0.01 260);
  --foreground: oklch(0.95 0.01 260);
  --surface: oklch(0.21 0.01 260);
  --muted: oklch(0.26 0.01 260);
  --muted-foreground: oklch(0.72 0.02 260);
  --border: oklch(0.32 0.01 260);
  --primary: oklch(0.70 0.16 262);
  --primary-foreground: oklch(0.17 0.01 260);
  --danger: oklch(0.68 0.19 27);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-danger: var(--danger);
}

@layer base {
  body { @apply bg-background text-foreground antialiased; }
}
```

`@theme inline` makes utilities reference `var(--background)` directly, so they follow
whatever value is in effect on the element (e.g. inside `.dark`). Without `inline`,
the variable would be resolved once at `:root` and the dark values would never apply.

Dark mode checklist: set the class before first paint (a tiny inline script in
`<head>` that reads the saved choice or `matchMedia('(prefers-color-scheme: dark)')`)
to avoid a light flash; add `color-scheme: light dark` (or per theme) so native
controls and scrollbars match; check contrast in both themes. Dark themes are not
inverted light themes: use slightly lighter surfaces for elevation instead of
shadows, and desaturate bright accents.

## 5. Writing classes

- **Class names must appear whole in the source.** Tailwind scans files as text, so
  `bg-${color}-500` never generates CSS. Map values to full strings:

  ```tsx
  const tone = { info: 'bg-sky-100 text-sky-900', danger: 'bg-red-100 text-red-900' } as const
  <p className={tone[kind]} />
  ```

  Classes that only exist at runtime (CMS content): `@source inline("bg-red-{100,500}");`.
- **Sources:** files ignored by git are not scanned. For classes inside a package in
  `node_modules` or a folder outside the project: `@source "../node_modules/@acme/ui";`.
  Exclude with `@source not "./legacy";`.
- **Responsive is mobile-first:** unprefixed = all sizes, `md:` = 48rem and up.
  `max-md:` targets below md, `md:max-lg:` a range, `min-[900px]:` one-offs.
- **Container queries** for components that live in different widths: `@container` on
  the parent, `@md:grid-cols-2` on children; name them with `@container/card` and
  `@md/card:`.
- **State variants:** `hover:` (v4 applies it only on devices that can hover),
  `focus-visible:`, `disabled:`, `aria-expanded:`, `aria-invalid:`,
  `data-[state=open]:`, `group-hover:`, `peer-invalid:`, `has-[:checked]:`, `not-*:`,
  `open:`, `inert:`, `starting:` (entry transitions), `motion-safe:` /
  `motion-reduce:`, `forced-colors:`, `print:`.
- **Arbitrary values:** `w-[37rem]`, `grid-cols-[1fr_auto]`; CSS variables with
  parentheses: `bg-(--brand)`, `w-(--sidebar-width)`.
- **Important:** trailing `!` — `bg-red-500!`. Needing it usually means a class
  conflict that `cn()` should resolve instead.
- Prefer `gap-*` in flex/grid over `space-*` and margins; `size-10` for equal
  width/height; `min-w-0` on flex children that must truncate; `text-balance` for
  headings, `text-pretty` for paragraphs; `tabular-nums` for numbers in tables.

## 6. Reuse without fighting specificity

- Reuse through components, not `@apply` classes. `@apply` is fine for a few base
  styles and third-party markup you can't add classes to.
- `cn()` merges conditional classes and lets callers override defaults:

  ```ts
  import { clsx, type ClassValue } from 'clsx'
  import { twMerge } from 'tailwind-merge' // v3.x supports Tailwind v4

  export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
  // cn('px-4 py-2 bg-primary', isActive && 'bg-primary/80', className)
  ```

- Variants: a typed map (`const variants = { primary: '…', ghost: '…' } as const`),
  or `class-variance-authority` / `tailwind-variants` when there are several
  dimensions (variant × size × state).
- Custom utilities that work with variants: `@utility content-auto { content-visibility: auto; }`
  → `content-auto`, `md:content-auto`.
- Sort classes automatically with `prettier-plugin-tailwindcss` rather than by hand.

## 7. When a class "doesn't work"

1. Is the name v3-only or renamed? (`bg-opacity-50`, `shadow` vs `shadow-sm`,
   `outline-none`) → `references/v3-to-v4.md`.
2. Is the class built dynamically? → write the full string.
3. Is the file outside the scanned sources or git-ignored? → `@source`.
4. Is another class winning? Two utilities for the same property in one element —
   the later one in the *stylesheet* wins, not the later one in `className`. Use
   `cn()` so only one survives.
5. Is the CSS file imported and the plugin registered? Check the built CSS:
   `grep -o 'the-class-name' dist/assets/*.css`.
6. Browser devtools: is the rule present but overridden, or missing entirely?

## References

- `references/v3-to-v4.md` — renamed and removed utilities, changed defaults, config
  equivalents. Read when editing an older project or when output looks subtly off.
