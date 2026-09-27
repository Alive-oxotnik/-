---
name: webapp-testing
description: Look at a web app in a real headless browser instead of guessing — start the dev server, screenshot pages at phone and desktop widths (light/dark), click through flows, and catch console errors, uncaught exceptions, failed requests, broken images and horizontal overflow with a bundled Playwright script; then write durable Playwright end-to-end tests for important flows. Use this whenever you change anything visible in a frontend (to confirm it actually renders and looks right), when the user reports a UI bug, a blank page or "it looks broken on mobile", asks for screenshots, or wants e2e, UI or regression tests. Don't report a UI change as done without looking at it.
---

# Web app testing

A passing build says nothing about whether the page renders, looks right on a phone,
or throws in the console. Looking takes a few seconds with the bundled script, so
do it after every visible change.

## 1. Start the app

- Find the command and port in `package.json` scripts and the framework defaults:
  Vite `5173` (preview `4173`), Next.js `3000`, Astro `4321`, SvelteKit `5173`.
- Run it in the background so it keeps serving while you work — in Claude Code, the
  Bash tool with `run_in_background`, or `npm run dev > /tmp/dev.log 2>&1 &`.
  Pin the port so the URL is predictable: `npm run dev -- --port 5173 --strictPort`
  (Vite) or `npm run dev -- -p 3000` (Next.js).
- If the page doesn't come up, read the server log before anything else.
- Stop the server when you're done.

## 2. Snapshot the page

`scripts/snap.cjs` lives in this skill's directory (the folder containing this
SKILL.md). It uses the project's Playwright if installed, otherwise a global one,
and falls back to any Chromium already on the machine.

```bash
node <skill-dir>/scripts/snap.cjs http://localhost:5173
```

It waits for the server (up to 30 s), loads the page at 390px and 1280px, saves
PNGs (default `<tmp>/snaps/`, change with `--out`), and prints:

- uncaught exceptions and console errors (with source locations),
- failed requests (network errors and HTTP ≥ 400),
- broken images, a missing viewport meta tag,
- horizontal overflow with the elements that stick out.

Exit code 0 = no problems found, 1 = problems found, 2 = couldn't run.

**Then open the screenshots with the Read tool and actually look at them.** The
report only catches mechanical failures; layout, spacing and polish need eyes.

Useful options (`--help` shows all):

```bash
# a flow: open the menu, type, submit, wait for the result
node <skill-dir>/scripts/snap.cjs localhost:5173/login \
  --fill "#email=ada@example.com" --fill "#password=secret123" \
  --click "role=button[name='Sign in']" --wait "text=Dashboard"

node <skill-dir>/scripts/snap.cjs localhost:5173 --dark --full           # dark theme, whole page
node <skill-dir>/scripts/snap.cjs localhost:5173 --widths 360,768,1440   # more breakpoints
node <skill-dir>/scripts/snap.cjs localhost:5173 --element "main form"   # one element up close
```

Steps (`--click`, `--fill sel=text`, `--type text`, `--press Key`, `--hover`,
`--wait ms|selector`, `--goto url`) run in order before the screenshot; selectors
are Playwright selectors (CSS, `text=…`, `role=button[name='…']`, `[data-testid=…]`).
`--fill` splits at the first `=` outside brackets, so for selectors that contain a
top-level `=` (`role=…`, `text=…`) focus the field with `--click` and use `--type`.

## 3. What to look for in the screenshots

- Nothing overlaps, is cut off or overflows; text wraps sensibly; long words and
  numbers don't break the layout.
- Alignment and spacing are consistent; one clear primary action per view.
- Mobile: navigation usable, tap targets big enough, no tiny text, no sideways scroll.
- Loading, empty and error states look intentional (trigger them with steps or by
  pointing the app at a failing API).
- Dark mode: no invisible text, borders or icons.
- Images load and keep their aspect ratio.

## 4. Fixing what the report finds

| Symptom | Usual cause |
|---|---|
| Blank page + uncaught exception | failed import, missing env variable, code touching `window` during SSR |
| Next.js hydration error | server and client render differently: dates, `Math.random()`, `window`/`localStorage` read during render, invalid nesting like `<div>` inside `<p>` |
| Failed requests to `/api/...` | wrong base URL, dev proxy not configured, CORS, backend not running |
| Horizontal overflow at 390px | fixed widths (`w-[600px]`), long unbroken strings (`break-words`), flex children without `min-w-0`, wide tables (wrap in `overflow-x-auto`), `100vw` inside a scrolling page |
| Broken image | path relative to the wrong base; assets in `public/` are served from `/` |

After fixing, run the script again — the report should be clean before you say it's
done.

## 5. Ad-hoc scripts for complex checks

When a check needs logic (log in, then visit several pages; mock an API; read
values), write a short Playwright script in a temp directory rather than stretching
the CLI flags. Recipes for common cases — login, network mocking, waiting,
extracting data, per-device screenshots — are in `references/playwright-recipes.md`.

## 6. Durable end-to-end tests

For flows that must keep working (sign-up, checkout, the core feature), add
`@playwright/test` tests to the project (setup: `npm init playwright@latest -- --quiet --browser=chromium --no-examples`).

```ts
import { expect, test } from '@playwright/test'

test('user can create a project', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Project name').fill('Apollo')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Apollo' })).toBeVisible()
})
```

- Locate elements the way users do: `getByRole`, `getByLabel`, `getByText`;
  `getByTestId` only when there's nothing better.
- Use web-first assertions (`await expect(locator).toBeVisible()`), never fixed
  sleeps — they auto-wait and retry.
- Each test sets up its own state (fresh context, seeded data or mocked API via
  `page.route`); tests must not depend on each other's order.
- Configure `webServer` and `use.baseURL` in `playwright.config.ts` so tests start
  the app themselves.
- Run with a non-interactive reporter: `npx playwright test --reporter=line`. The
  default HTML reporter opens a report server after failures and blocks the
  terminal. Failure screenshots and error context land in `test-results/`.
- Visual comparisons (`await expect(page).toHaveScreenshot()`) only pay off on a
  stable machine/CI image; mask dynamic regions (dates, avatars).
- Accessibility checks fit in the same suite (`@axe-core/playwright`, see the
  **web-accessibility** skill).

## 7. When the browser won't launch

- The script and Playwright need a Chromium build. Normally
  `npx playwright install chromium` provides it.
- On machines where downloads are blocked but a Chromium exists (e.g. a shared
  `PLAYWRIGHT_BROWSERS_PATH`), the script finds it automatically; for the test
  runner set `use: { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }`
  and export `CHROMIUM_PATH` to that binary.
- Point `CHROMIUM_PATH` at any Chrome/Chromium to override detection.

## Clean up

Stop background servers, and keep screenshots out of the repo unless the user asks
for them (they live in the temp directory by default).
