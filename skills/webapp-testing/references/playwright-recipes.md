# Playwright recipes

Short scripts for checks that are too involved for `snap.cjs` flags. Tested with
Playwright 1.5x/1.6x. Write them in a temp directory, not in the project.

Contents
1. Script template (works with or without Playwright in the project)
2. Log in once, reuse the session
3. Mock or break the API
4. Waiting for the right moment
5. Reading values from the page
6. Devices, dark mode, locale, time
7. Before/after comparison
8. `playwright.config.ts` for a project
9. Test patterns: fixtures, network mocks, a11y, visual

---

## 1. Script template

```js
// /tmp/check.cjs — run: node /tmp/check.cjs
const path = require('path')
const { execSync } = require('child_process')
const { createRequire } = require('module')

function loadPlaywright() {
  // project first (matching version), then the global install
  for (const base of [process.cwd(), execSync('npm root -g').toString().trim()]) {
    try { return createRequire(path.join(base, 'noop.js'))('playwright') } catch {}
    try { return createRequire(path.join(base, 'noop.js'))('@playwright/test') } catch {}
  }
  throw new Error('Playwright not found: npm i -D playwright')
}

const { chromium, devices } = loadPlaywright()

;(async () => {
  const browser = await chromium.launch() // add { executablePath: process.env.CHROMIUM_PATH } if needed
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()))
  page.on('pageerror', (e) => console.log('page error:', e.message))

  await page.goto('http://localhost:5173/')
  // … steps …
  await page.screenshot({ path: '/tmp/check.png', fullPage: true })
  await browser.close()
})()
```

Run it from the project directory so the project's Playwright is found first.
With ESM (`.mjs`) use `createRequire(import.meta.url)` the same way — plain
`import 'playwright'` does not see global packages.

## 2. Log in once, reuse the session

```js
// log in and save cookies + localStorage
await page.goto('http://localhost:5173/login')
await page.getByLabel('Email').fill('ada@example.com')
await page.getByLabel('Password').fill(process.env.TEST_PASSWORD)
await page.getByRole('button', { name: 'Sign in' }).click()
await page.waitForURL('**/dashboard')
await context.storageState({ path: '/tmp/auth.json' })

// later, in another script or context
const authed = await browser.newContext({ storageState: '/tmp/auth.json' })
```

Never write real credentials into scripts or the repo; read them from env vars.

## 3. Mock or break the API

```js
// fixed data
await page.route('**/api/projects', (route) =>
  route.fulfill({ json: [{ id: '1', name: 'Apollo' }, { id: '2', name: 'Gemini' }] }),
)
// empty state
await page.route('**/api/projects', (route) => route.fulfill({ json: [] }))
// error state
await page.route('**/api/projects', (route) => route.fulfill({ status: 500, body: 'boom' }))
// slow response → see the loading state
await page.route('**/api/projects', async (route) => {
  await new Promise((r) => setTimeout(r, 3000))
  await route.continue()
})
// modify the real response
await page.route('**/api/user', async (route) => {
  const response = await route.fetch()
  const json = await response.json()
  await route.fulfill({ response, json: { ...json, name: 'A very long name that might break the header layout' } })
})
// block third-party noise (analytics, chat widgets)
await page.route(/googletagmanager|intercom|hotjar/, (route) => route.abort())
```

Register routes **before** `page.goto`. Mocks are the quickest way to see loading,
empty, error and long-content states that are hard to reach with real data.

## 4. Waiting for the right moment

```js
await page.getByRole('heading', { name: 'Dashboard' }).waitFor()          // element visible
await page.waitForURL('**/projects/*')                                    // navigation done
const res = await page.waitForResponse((r) => r.url().includes('/api/projects') && r.ok())
await page.waitForLoadState('networkidle')                                // use sparingly
await page.waitForFunction(() => document.fonts.status === 'loaded')      // before screenshots
```

Avoid fixed `waitForTimeout` except to let an animation settle before a screenshot.

## 5. Reading values from the page

```js
const titles = await page.getByRole('listitem').allTextContents()
const count = await page.locator('[data-testid=cart-count]').textContent()
const box = await page.getByRole('button', { name: 'Buy' }).boundingBox()   // size / position
const styles = await page.getByRole('button', { name: 'Buy' }).evaluate((el) => {
  const s = getComputedStyle(el)
  return { color: s.color, background: s.backgroundColor, fontSize: s.fontSize }
})
const metrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
}))
```

## 6. Devices, dark mode, locale, time

```js
const phone = await browser.newContext({
  ...devices['iPhone 15'], // also 'Pixel 7', 'Galaxy S24', 'iPad Pro 11', 'Desktop Chrome'
  colorScheme: 'dark',
  reducedMotion: 'reduce',
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
})
```

Freeze time for deterministic screenshots with `await page.clock.setFixedTime(new Date('2026-01-15T10:00:00'))`
before `goto`.

## 7. Before/after comparison

Take the same screenshots before and after a change, with the same viewport and
data (mock the API), then read both images and compare. For whole-page regressions
in a test suite, use `toHaveScreenshot()` (section 9) instead.

## 8. `playwright.config.ts` for a project

```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 5173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Use an existing Chromium when browsers can't be downloaded:
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
```

Run: `npx playwright test --reporter=line`, one file: `npx playwright test e2e/checkout.spec.ts`,
one test: `-g "creates a project"`, one project: `--project=mobile`.

## 9. Test patterns

```ts
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/projects', (route) => route.fulfill({ json: [] }))
  })

  test('shows an empty state with a call to action', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.getByText('No projects yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New project' })).toBeEnabled()
  })

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/projects')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(violations).toEqual([])
  })

  test('matches the visual baseline', async ({ page }) => {
    await page.goto('/projects')
    await expect(page).toHaveScreenshot('projects-empty.png', {
      fullPage: true,
      mask: [page.locator('[data-testid=avatar]')],
    })
  })
})
```

- Update visual baselines deliberately: `npx playwright test --update-snapshots`,
  then look at the new images before committing them.
- Keep e2e tests few and focused on critical journeys; cover component logic with
  Vitest + Testing Library, which is faster.
