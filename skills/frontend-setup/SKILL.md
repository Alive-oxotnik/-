---
name: frontend-setup
description: Start a new frontend project or add standard tooling to an existing one using the current versions of the official tools. Picks a stack (Vite + React + TypeScript by default, Next.js when SEO/SSR/server code matter, Astro for content sites), scaffolds it without interactive prompts, adds Tailwind CSS, linting and formatting, Vitest + Testing Library, Playwright and path aliases, and proves the result with build, lint and test runs. Use this whenever the user wants to create, bootstrap, scaffold or initialize a web app, SPA, landing page, dashboard or site (including "make me a website" in an empty repo), asks which frontend stack to pick, or wants to add Tailwind, ESLint/Oxlint, Prettier, Vitest, Playwright, aliases or a folder structure to a frontend project.
---

# Frontend project setup

Frontend tooling moves faster than any model's training data. When this skill was
written, create-vite had switched its React templates from ESLint to Oxlint, Vite 8
resolved tsconfig paths natively, TypeScript 6 had turned `strict` on by default,
and create-next-app generated an AGENTS.md warning agents that their Next.js
knowledge is out of date. Config typed from memory is the most common cause of
broken setups, so the working rule here is:

**Let the official CLIs generate config, and check the installed version and its
docs before hand-editing anything** — `npx <cli> --help`, `npm ls <pkg>`,
`node_modules/<pkg>/README.md`, `npm view <pkg> version peerDependencies`.

## 1. Look before you scaffold

- A `package.json` already exists → this is "add tooling", not "new project". Skip to
  step 4 and keep the project's existing choices.
- Read `AGENTS.md` / `CLAUDE.md` if present. They override the defaults below.
- Package manager: follow the lockfile (`package-lock.json` → npm, `pnpm-lock.yaml` →
  pnpm, `yarn.lock` → yarn, `bun.lock` → bun). New project: npm unless the user
  prefers another.
- `node -v`: current Vite needs Node 20.19+ or 22.12+.

## 2. Choose the stack

| The user wants… | Use | Why |
|---|---|---|
| App behind a login, dashboard, internal tool, SPA, widget, prototype | **Vite + React + TS** (`react-ts`) | Fast, simple, nothing to run on a server |
| Same, with React Compiler (automatic memoization) | Vite `react-compiler-ts` | Compiler pre-wired |
| Public site where SEO and first load matter, SSR, API routes, server actions, auth | **Next.js** (App Router) | Server rendering and backend in one |
| Blog, docs, marketing site with little interactivity | **Astro** | Ships almost no JS by default |
| Vue / Svelte / Solid / Preact / Lit | Vite `vue-ts`, `svelte-ts`, `solid-ts`, `preact-ts`, `lit-ts` | Same tooling, other framework |
| One static page | Plain HTML/CSS/JS or Vite `vanilla-ts` | No framework needed |

If the user has no preference, use Vite + React + TypeScript + Tailwind and say so in
one line. Ask only when the answer changes the outcome a lot — "does this need to
rank in Google?" decides between an SPA and Next.js.

## 3. Scaffold without prompts

Interactive prompts hang an agent, so always pass the non-interactive flags. If a
flag is rejected, run the CLI with `--help`; they get renamed.

**Vite**

```bash
npm create vite@latest my-app -- --template react-ts --no-interactive
```

- The bare `--` hands the flags through npm to create-vite.
- `--eslint` gives ESLint instead of the default Oxlint (React templates only).
- Scaffolding into `.` works only when the directory holds nothing but `.git`;
  otherwise the CLI cancels. Never pass `--overwrite` in a user's repo — it deletes
  the existing files. For a repo that already has a README or LICENSE, scaffold into
  a temp dir and copy without clobbering, then merge `.gitignore`/README by hand:

  ```bash
  npm create vite@latest /tmp/scaffold -- --template react-ts --no-interactive
  cp -Rn /tmp/scaffold/. .
  ```

**Next.js**

```bash
npx create-next-app@latest my-app --ts --tailwind --eslint --app --use-npm --yes
```

Also available: `--src-dir`, `--react-compiler`, `--biome` (instead of ESLint),
`--disable-git`, `--skip-install`. The generated AGENTS.md points at
`node_modules/next/dist/docs/` — read the relevant guide there before writing Next.js
code, because routing, caching and config APIs have changed across versions.

**Astro**

```bash
npm create astro@latest my-site -- --template minimal --install --no-git --yes
```

Then `cd` in, install if the CLI didn't, and run `npm run build` once **before**
adding anything, so any later failure is clearly caused by your changes.

## 4. Add what the project needs

Every tool is something to maintain, so add what the task calls for. A sensible
default for a real project is Tailwind + linter + formatter + Vitest; add Playwright
once there are user flows worth protecting.

### Tailwind CSS (v4)

```bash
npm i -D tailwindcss @tailwindcss/vite
```

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

```css
/* src/index.css — replaces the template's CSS */
@import "tailwindcss";
```

v4 needs no `tailwind.config.js` and no PostCSS config with Vite — the theme lives in
CSS (`@theme`). Next.js created with `--tailwind` is already set up through
`@tailwindcss/postcss`. For tokens, dark mode and v3→v4 differences, use the
**tailwind-css** skill.

### Path alias `@/` → `src/`

```jsonc
// tsconfig.app.json → "compilerOptions"
"paths": { "@/*": ["./src/*"] }
```

```ts
// vite.config.ts — Vite 8+ resolves tsconfig paths itself
resolve: { tsconfigPaths: true },
```

On older Vite (`npm ls vite`), use `resolve.alias` or the `vite-tsconfig-paths`
plugin instead. Next.js reads `paths` from tsconfig on its own.

### Lint and format

- Keep the linter the scaffold chose (Oxlint for create-vite, ESLint for Next.js)
  unless the user asks otherwise, and make `npm run lint` pass.
- Oxlint can check accessibility too: add `"jsx-a11y"` to `plugins` in
  `.oxlintrc.json`. On ESLint use `eslint-plugin-jsx-a11y`.
- React on ESLint: use `reactHooks.configs.flat.recommended` from
  `eslint-plugin-react-hooks`. It now includes React Compiler–based rules
  (`set-state-in-effect`, `refs`, `purity`, `immutability`, …) that catch real bugs.
- Prettier, unless the project already uses Biome or another formatter:

  ```bash
  npm i -D prettier prettier-plugin-tailwindcss
  ```

  ```json
  {
    "semi": false,
    "singleQuote": true,
    "plugins": ["prettier-plugin-tailwindcss"],
    "tailwindStylesheet": "./src/index.css"
  }
  ```

  `.prettierrc` above — with Tailwind v4 the class-sorting plugin needs
  `tailwindStylesheet` pointing at the CSS entry. Match the existing code style
  instead if there is one, and add a script `"format": "prettier --write ."`.

### Unit and component tests (Vitest + Testing Library)

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

```ts
// vite.config.ts
/// <reference types="vitest/config" />
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
```

Add `"test": "vitest"` to scripts, but run `npx vitest run` yourself — plain `vitest`
starts watch mode and never exits. Write one real test (render a component, click,
assert) to prove the wiring works. In Next.js, Vitest cannot render async Server
Components; cover those with Playwright.

### End-to-end tests (Playwright)

```bash
npm init playwright@latest -- --quiet --browser=chromium --no-examples
```

Then point `playwright.config.ts` at the app so tests start it themselves:

```ts
use: { baseURL: 'http://localhost:5173' },
webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
```

On machines that can't download browsers, add `--no-browsers` and see the
**webapp-testing** skill for using an already-installed Chromium.

### TypeScript notes

- Scaffolds pin a TypeScript version on purpose. Before a major upgrade, check that
  every TS-dependent tool supports it: `npm view typescript-eslint peerDependencies`.
- TypeScript 6+ is `strict` by default and includes no ambient `@types` unless
  listed, so keep `"types": ["vite/client"]` (plus `"node"`, and `"vitest/globals"`
  only when Vitest `globals: true`).
- Add `"typecheck": "tsc -b"` (Vite project references) or `"tsc --noEmit"`.

## 5. Structure

Start small and don't create empty folders "for later". A layout that grows well:

```
src/
  main.tsx, App.tsx      entry, providers, router
  components/ui/         reusable primitives (Button, Input, Dialog)
  features/<name>/       components, hooks and API calls of one feature
  lib/                   framework-free helpers (formatters, fetch wrapper, cn)
  test/setup.ts
```

Keep tests next to the code (`Button.test.tsx` beside `Button.tsx`). In Next.js
follow its `app/` routing conventions instead.

## 6. Prove it works, then leave notes

```bash
npm run build && npm run lint && npx vitest run
```

Show the user the summary lines. Then start the dev server in the background and
look at the page (the **webapp-testing** skill has a screenshot script) — a green
build can still render a blank page.

Finally add a short `CLAUDE.md` (or extend the existing one) with the package
manager, the `dev/build/lint/test` commands, where components live and the styling
approach, so future sessions don't have to rediscover the project.

## Done means

- [ ] build, lint and tests pass, and the user has seen the output
- [ ] the dev server renders the page with no console errors
- [ ] `.gitignore` covers `node_modules`, `dist` / `.next`, `.env*`, test reports
- [ ] no secrets committed; `.env.example` lists required variables
- [ ] CLAUDE.md lists the commands
