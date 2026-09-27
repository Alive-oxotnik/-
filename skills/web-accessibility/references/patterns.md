# Accessible UI patterns

Prefer a maintained headless library for complex widgets (Radix UI, React Aria,
Headless UI, Ark UI). Use these patterns when building by hand or reviewing. React
snippets were type-checked with React 19; the ARIA rules apply to any framework.

Contents
1. Modal dialog (native `<dialog>`)
2. Disclosure / accordion
3. Tabs
4. Menu button vs. navigation dropdown
5. Combobox / autocomplete
6. Toasts and live regions
7. Skip link
8. Focus on route change (SPA)
9. Form errors and error summary
10. Icon buttons and tooltips
11. Data tables
12. CSS helpers (visually hidden, focus ring, reduced motion)

---

## 1. Modal dialog

The native element gives focus trapping, Esc to close, an inert background, the
top layer and focus return on close.

```tsx
import { useEffect, useId, useRef, type ReactNode } from 'react'

type ModalProps = { open: boolean; onClose: () => void; title: string; children: ReactNode }

export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose} // fires for Esc, form[method=dialog] and close()
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose() // click on the backdrop
      }}
      className="rounded-xl p-0 backdrop:bg-black/50"
    >
      <div className="grid gap-4 p-6">
        <h2 id={titleId}>{title}</h2>
        {children}
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}
```

- Put `autoFocus` on the element that should receive focus first (e.g. the safe
  button of a destructive confirmation); otherwise the first focusable element gets it.
- Wrap content in an inner element (as above) so clicks on padding don't count as
  backdrop clicks.
- Confirmation of destructive actions: `role="alertdialog"` and an
  `aria-describedby` pointing at the explanation.

## 2. Disclosure / accordion

Simplest: `<details><summary>Question</summary>Answer</details>` — keyboard and
state for free. Custom version: a `<button aria-expanded aria-controls>` toggling a
panel with `hidden`. For an accordion, put each trigger inside a heading
(`<h3><button …>`), so the headings outline stays meaningful.

## 3. Tabs

Roles `tablist` / `tab` / `tabpanel`; only the selected tab is in the Tab order
(roving `tabIndex`); Left/Right arrows move between tabs, Home/End jump to the ends.

```tsx
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type Tab = { id: string; label: string; content: ReactNode }

export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [selected, setSelected] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()

  function onKeyDown(e: KeyboardEvent) {
    const last = tabs.length - 1
    const next =
      e.key === 'ArrowRight' ? (selected === last ? 0 : selected + 1)
      : e.key === 'ArrowLeft' ? (selected === 0 ? last : selected - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    setSelected(next)
    refs.current[next]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            aria-selected={i === selected}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => setSelected(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={i !== selected}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
```

## 4. Menu button vs. navigation dropdown

- **Site navigation** ("Products ▾" with links) is *not* an ARIA menu. Use a
  disclosure: `<button aria-expanded aria-controls>` + a `<ul>` of `<a>` links. Tab
  moves through the links; Esc closes and returns focus to the button.
- **Application menus** (actions like Rename / Duplicate / Delete): button with
  `aria-haspopup="menu"` and `aria-expanded`; container `role="menu"`; items
  `role="menuitem"` with `tabIndex={-1}`; opening focuses the first item; Up/Down
  move, Home/End jump, Esc closes and refocuses the button, typing a letter jumps to
  the matching item, Tab closes the menu. Use a library for this — it is easy to get
  subtly wrong.

## 5. Combobox / autocomplete

Use a library (React Aria `ComboBox`, Headless UI `Combobox`, Downshift). Required
behavior when reviewing one:

- `<input role="combobox" aria-expanded aria-controls="listbox-id" aria-autocomplete="list">`
- Popup `role="listbox"` with `role="option"` items and `aria-selected` on the active one.
- Focus stays in the input; the highlighted option is conveyed with
  `aria-activedescendant="option-id"`.
- Down opens and moves, Enter selects, Esc closes (second Esc clears).
- The number of results is announced through a polite live region.

## 6. Toasts and live regions

```tsx
// Rendered once, near the root, *before* any message is set.
export function Announcer({ message, tone }: { message: string; tone: 'polite' | 'assertive' }) {
  return tone === 'assertive'
    ? <div role="alert" className="sr-only">{message}</div>
    : <div role="status" aria-live="polite" className="sr-only">{message}</div>
}
```

- Screen readers only announce *changes* inside a region that already exists; a
  region mounted together with its text is often not read.
- Toasts must not take focus. Keep them on screen long enough to read (≥5 s), pause
  the timer on hover/focus, and don't put the only copy of an important action in a
  toast.

## 7. Skip link

```tsx
<a
  href="#main"
  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black"
>
  Skip to content
</a>
{/* … header and navigation … */}
<main id="main" tabIndex={-1}>…</main>
```

`tabIndex={-1}` lets the target receive focus so the next Tab continues from the
main content.

## 8. Focus on route change (SPA)

Next.js App Router ships a route announcer that reads the new page title. In a
client-routed SPA (React Router etc.), move focus yourself — but not on the first
load:

```tsx
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

export function useFocusOnNavigate() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const heading = document.querySelector<HTMLElement>('main h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus()
    }
  }, [pathname])
}
```

Update `document.title` per route as well (React 19 lets components render
`<title>` directly and hoists it into `<head>`).

## 9. Form errors and error summary

```html
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email"
       aria-invalid="true" aria-describedby="email-hint email-error" />
<p id="email-hint">We'll send the receipt here.</p>
<p id="email-error">Enter an email address like name@example.com</p>
```

- Error text says what's wrong and how to fix it; an icon may accompany it but
  color alone is not enough.
- Validate on blur or submit, not on every keystroke while typing.
- On submit with several errors, show a summary at the top
  (`<div role="alert" tabindex="-1">` with links to each field) and move focus to it;
  with one error, focus the field.
- Keep the user's input after a failed submit.

## 10. Icon buttons and tooltips

```tsx
<button type="button" aria-label="Delete invoice INV-042" onClick={onDelete}>
  <TrashIcon aria-hidden className="size-4" />
</button>
```

- The name should say what happens, specifically enough to tell repeated buttons
  apart ("Delete invoice INV-042", not "Delete").
- A tooltip is not a label; it can repeat the label for sighted mouse users. If you
  add one, show it on focus too and dismiss it with Esc.
- Toggle buttons: keep the label constant and expose `aria-pressed`.

## 11. Data tables

```html
<table>
  <caption>Invoices, newest first</caption>
  <thead>
    <tr>
      <th scope="col" aria-sort="descending"><button type="button">Date</button></th>
      <th scope="col">Customer</th>
      <th scope="col" class="text-right">Amount</th>
    </tr>
  </thead>
  <tbody>…</tbody>
</table>
```

Sort controls are buttons inside the header; `aria-sort` goes on the `th` of the
sorted column only. On narrow screens let the table scroll horizontally inside a
labelled, focusable region (`<div role="region" aria-label="Invoices" tabindex="0"
class="overflow-x-auto">`) instead of breaking the page width.

## 12. CSS helpers

```css
/* Visually hidden, still read by screen readers (Tailwind: sr-only) */
.visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

/* Visible keyboard focus without showing rings on mouse click */
:focus-visible { outline: 2px solid var(--focus-ring, #2563eb); outline-offset: 2px; }

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
