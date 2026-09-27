---
name: web-accessibility
description: Build and audit accessible web interfaces to WCAG 2.2 AA — semantic HTML first, keyboard operation and visible focus, focus management for dialogs, menus and route changes, correct names/roles/states (ARIA only where HTML can't do it), accessible forms and error messages, contrast, motion and zoom — and verify with a bundled Playwright + axe-core script that also walks the page with the Tab key. Use this whenever you build or review interactive UI (modals, dropdowns, menus, tabs, comboboxes, toasts, carousels, forms, custom controls), when the user mentions accessibility, a11y, WCAG, screen readers, keyboard navigation, contrast, ADA or the European Accessibility Act, and as a final check before shipping any page.
---

# Web accessibility

Accessibility is mostly getting the basics right on every element — the right HTML
element, a name, keyboard support, visible focus, enough contrast. Automated tools
find roughly a third of real problems, so this skill combines rules for building,
an automated audit, and a short manual pass.

## Order of preference

1. **Native HTML** — `<button>`, `<a href>`, `<input>`, `<select>`, `<dialog>`,
   `<details>`, `<fieldset>`, `<table>`. They come with roles, keyboard support and
   states for free.
2. **A headless library that implements the ARIA pattern** for widgets HTML doesn't
   have (combobox, menu, tabs, date picker): Radix UI, React Aria, Headless UI, Ark UI,
   or the project's existing component library.
3. **Hand-written ARIA** only as a last resort, following the WAI-ARIA Authoring
   Practices pattern exactly (`references/patterns.md`). Wrong ARIA is worse than
   none: it tells screen readers something false.

## Build rules

**Structure**
- One `<main>`; `<header>`, `<nav>` (with `aria-label` when there are several),
  `<footer>`. One `<h1>` per page, headings in order without skipping levels.
- `<html lang="…">`, and a unique `<title>` per page/route.
- Action → `<button type="button">`; navigation → `<a href>`. Never `<div onClick>`.
- Lists as `<ul>/<ol>`, data as `<table>` with `<th scope>` and a `<caption>`.

**Keyboard**
- Everything clickable is reachable with Tab and works with Enter/Space; Esc closes
  overlays; arrow keys move inside composite widgets (tabs, menus, listboxes, radio
  groups) while Tab moves between widgets.
- Focus order follows the visual order — fix the DOM order instead of using
  positive `tabindex`.
- Focus is always visible: never remove outlines without a replacement. Use
  `:focus-visible` styles with ≥3:1 contrast against the background
  (Tailwind: `focus-visible:outline-2 focus-visible:outline-offset-2`).
- Add a "Skip to content" link as the first focusable element on pages with
  navigation.
- No keyboard traps — except inside an open modal, which must trap focus.

**Focus management**
- Opening a modal moves focus into it (first field, or the dialog itself); closing
  returns focus to the element that opened it. The native `<dialog>` with
  `showModal()` does trapping, Esc, inert background and focus return for you.
- SPA route change: move focus to the new page's `<h1>` (or main) and update
  `document.title`, otherwise screen reader users don't notice the page changed.
- After deleting an item, move focus to a neighbour or the list heading, not `<body>`.
- Toasts and live updates must not steal focus.

**Names, roles, states**
- Every control has an accessible name: visible label text; `aria-label` for
  icon-only buttons (`<button aria-label="Close">`); `alt` for images — describe the
  meaning, or `alt=""` for decorative images. Hide decorative icons with
  `aria-hidden="true"`.
- Expose state: `aria-expanded` on disclosure triggers, `aria-pressed` on toggle
  buttons, `aria-selected` in tabs/listboxes, `aria-current="page"` in navigation,
  `aria-invalid` on fields with errors, `aria-busy` while a region loads.
- Announce async results with a live region that exists before the update:
  `<div role="status" aria-live="polite">` for info, `role="alert"` for errors.
- Visually hidden but readable text: Tailwind `sr-only`.

**Forms**
- Every field has a visible `<label>`; a placeholder is not a label (it disappears
  when typing and usually fails contrast).
- Group related controls in `<fieldset>` + `<legend>` (radio groups, address).
- Mark required fields in text, not only with color or an asterisk.
- Errors: specific text next to the field, linked with `aria-describedby`, plus
  `aria-invalid="true"`; on submit, move focus to the first invalid field or to an
  error summary.
- Use the right `type` and `autocomplete` (`email`, `tel`, `current-password`,
  `one-time-code`) — it helps everyone, especially people with motor or cognitive
  disabilities. Don't block paste.

**Visual**
- Contrast: 4.5:1 for normal text, 3:1 for large text (≥24px, or ≥18.66px bold),
  3:1 for UI component boundaries, focus indicators and meaningful graphics.
  Check both light and dark themes.
- Don't rely on color alone: errors get an icon or text, links in body text get an
  underline.
- Target size at least 24×24 CSS px (WCAG 2.2); 44×44 is better for primary actions
  on touch screens.
- Works at 200% zoom and at 320px width without horizontal scrolling (except data
  tables, maps and similar).
- Respect `prefers-reduced-motion` (Tailwind `motion-safe:` / `motion-reduce:`); no
  content flashing more than 3 times per second.
- Tooltips and hover cards: open on focus too, dismiss with Esc, stay open while
  the pointer is over them.

**Media**: captions for video, transcripts for audio, no autoplaying sound.

## Audit

### 1. Automated check (bundled script)

The script is in this skill's directory (the folder containing this SKILL.md).
It needs Playwright and axe-core; if axe-core is missing it prints how to install it
(in the project as a dev dependency, or outside the project via `AXE_CORE_PATH`).

```bash
node <skill-dir>/scripts/a11y-audit.cjs http://localhost:5173 --tab 25
node <skill-dir>/scripts/a11y-audit.cjs http://localhost:5173/settings --widths 390,1280 --dark
# audit an open state, e.g. a dialog
node <skill-dir>/scripts/a11y-audit.cjs http://localhost:5173 --click "text=Delete account" --wait "role=dialog" --tab 6
```

It runs WCAG 2.0–2.2 A/AA rules and prints violations by impact with selectors and
fix hints, then (with `--tab N`) presses Tab N times and lists what received focus,
flagging controls without a name, focus that seems invisible, focus lost to
`<body>`, and focus traps. Exit code 1 means violations at or above `--fail-on`
(default `serious`). `--json` gives machine-readable output; `--help` lists all
options.

For CI, the same check fits into Playwright tests with `@axe-core/playwright`:

```ts
import AxeBuilder from '@axe-core/playwright'

test('home page has no detectable a11y violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
```

Static linting catches some issues while typing: Oxlint `"plugins": ["jsx-a11y"]`
or ESLint `eslint-plugin-jsx-a11y`.

### 2. Manual pass (10 minutes, catches what tools can't)

- Keyboard only: can you reach and operate everything, see where focus is, open
  and close every overlay, and never get stuck?
- Screen reader spot check of the changed flow: VoiceOver (macOS: Cmd+F5), NVDA
  (Windows), TalkBack (Android). Do controls announce a sensible name, role and
  state? Are errors and async results announced?
- Zoom to 200% and narrow the window to 320px.
- Turn on reduced motion and a dark/high-contrast theme.

### 3. Report

Group findings by severity, name the WCAG success criterion, point to file:line,
and give the concrete fix. Fix critical/serious ones before cosmetic ones; re-run
the script to confirm.

## References

- `references/patterns.md` — ready patterns for dialog, disclosure, tabs, menu
  button, combobox, toast/live region, skip link, route announcer, form errors,
  icon buttons, data tables. Read when building one of these widgets.
