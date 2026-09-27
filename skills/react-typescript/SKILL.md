---
name: react-typescript
description: Write, refactor and review React components in TypeScript the modern way (React 19) — typed props and variants, composition over configuration, deciding where state lives, effects only for syncing with external systems, data fetching with a cache, forms with actions or react-hook-form + zod, error boundaries and Suspense, performance without premature memoization, and behavior-focused tests. Use this whenever a task touches .tsx/.jsx components, hooks, context, forms, data fetching or state in a React, Next.js or React Router app, or asks to review React code — even for a "small" component, because most React bugs (stale state, effect loops, fetch races, needless re-renders) come from the patterns this skill covers.
---

# React + TypeScript

## Before writing code

1. **Check versions and the framework.** `npm ls react react-dom typescript` and look
   for Next.js / React Router / Remix / Expo. In the Next.js App Router, components
   are Server Components unless the file starts with `'use client'`; hooks, state,
   effects and browser APIs need a client component, so keep `'use client'` on the
   smallest leaf that needs interactivity.
2. **Follow the codebase over this skill.** Look at two or three existing components:
   file naming, export style, styling approach, state and data libraries, test style.
   Consistency matters more than any default below.
3. **Is React Compiler on?** (`babel-plugin-react-compiler`, `reactCompilerPreset`, or
   `reactCompiler: true` in Next config). If yes, don't add `useMemo`/`useCallback`/
   `memo` by default — the compiler memoizes, and manual memoization is noise.

## Components and props

- Function components with named exports; type props with a `type` next to the
  component. No `React.FC` needed — let the return type be inferred.
- Wrap native elements by extending their props so consumers keep every HTML
  attribute: `type ButtonProps = ComponentProps<'button'> & { variant?: Variant }`.
  In React 19 `ref` is an ordinary prop — no `forwardRef` needed.
- Model options as unions, not boolean piles: `variant: 'primary' | 'ghost'` instead
  of `isPrimary` + `isGhost`. Use discriminated unions when props depend on each
  other (`{ mode: 'link'; href: string } | { mode: 'button'; onClick: () => void }`).
- Prefer composition (`children`, slot props, small sub-components) once a component
  grows past ~7 props or branches on props to render different layouts.
- Keep rendering pure: same props and state → same JSX, no side effects in the
  render body. StrictMode double-rendering and React Compiler both rely on it.
- Never declare a component inside another component — it remounts on every render
  and loses its state.
- Keys come from stable data ids; index keys only for static lists that never
  reorder.
- Name callback props `onSomething`, internal handlers `handleSomething`.

## Where state lives

Walk this ladder and stop at the first rung that works:

1. **Derive it.** If it can be computed from props or other state, compute it during
   render (with `useMemo` only when measurably expensive). Storing derived values
   (`filteredItems`, `fullName`, a copy of a prop) creates sync bugs.
2. **Local `useState`**; `useReducer` when several fields change together or the next
   state depends on transitions.
3. **Lift** to the closest common parent.
4. **URL** (search params) for anything shareable or that should survive reload:
   filters, tabs, pagination, selected item.
5. **Context** for low-frequency, app-wide values: theme, locale, current user.
   Split contexts by update frequency.
6. **External store** (Zustand, Redux Toolkit, Jotai) for complex, frequently
   updated client state shared across distant components.
7. **Server state is not client state** — keep it in a cache (TanStack Query, SWR,
   framework loaders, Server Components), not in `useState`.

To reset a component's state when an identity changes, give it `key={id}` instead of
syncing with an effect.

## Effects are for external systems

Use `useEffect` to synchronize with something outside React: subscriptions, timers,
DOM APIs, non-React widgets, and network calls when no data library is available.
Everything else has a better home:

| Instead of an effect that… | Do this |
|---|---|
| computes a value from props/state | compute it during render |
| reacts to a user event | put the logic in the event handler |
| resets state when a prop changes | `key` on the component |
| notifies the parent after a state change | call the parent's callback in the same handler |
| fetches data on mount | a data library / loader / Server Component |

When an effect is right: return a cleanup, list every dependency (don't silence the
lint rule — restructure instead), and guard async work against races with an
`AbortController` or an `ignore` flag. To read the latest props inside an effect
without re-running it, use `useEffectEvent` (React 19.2+). The
`react-hooks/set-state-in-effect` lint rule flags synchronous `setState` in effects,
which usually means the value should be derived.

## Data fetching

- In a framework, use its data layer (Server Components or route loaders).
- In a Vite SPA, use TanStack Query: `useQuery({ queryKey: ['user', id], queryFn })`,
  `useMutation` + `invalidateQueries` for writes. It handles caching, dedup, retries
  and races that hand-written effects get wrong.
- Every data-driven view renders four states: loading, error (with retry), empty,
  and data. Skeletons should match the final layout to avoid layout shift.
- Types don't validate runtime data. Parse responses at the boundary with a schema
  (`zod`) and infer the type from it: `type User = z.infer<typeof User>`.
- `use(promise)` + Suspense only works with promises created outside render
  (framework or cached); a promise created during render refetches forever.

## Forms

- Simple forms (and anything using Next.js Server Actions): `<form action={fn}>` with
  `useActionState` for the result and pending state, and `useFormStatus` inside the
  submit button.
- Complex client forms (many fields, conditional fields, field-level validation):
  `react-hook-form` + `zodResolver` from `@hookform/resolvers/zod`.
- Validate on the server as well; client validation is only UX.
- Every input has a visible `<label>`; errors are text linked with
  `aria-describedby` plus `aria-invalid`; focus the first invalid field on submit.
  The **web-accessibility** skill has the details.

## Errors and loading

- Wrap independent regions in error boundaries (`react-error-boundary`, or the
  framework's `error.tsx`) so one failing widget doesn't blank the page.
- Place `<Suspense>` boundaries where a loading state makes sense to the user, not
  around every component.

## Performance: measure first

Profile with React DevTools before optimizing. The usual real wins:

- Move state down to where it's used; pass expensive subtrees as `children` so they
  don't re-render with their parent.
- Split a context whose value changes often, or memoize the value object (without
  the compiler).
- Virtualize long lists (`@tanstack/react-virtual`).
- Lazy-load heavy routes and widgets: `const Chart = lazy(() => import('./Chart'))`.
- Keep typing responsive during expensive updates with `useDeferredValue` or
  `useTransition`.
- Without React Compiler, `memo`/`useMemo`/`useCallback` pay off only for expensive
  computations or when a memoized child or an effect depends on referential
  stability.

For page-load metrics (LCP, INP, bundle size) use the **web-performance** skill.

## TypeScript habits

- No `any`: use `unknown` and narrow. Non-null `!` only for true invariants.
- `satisfies` for config objects and maps (`const routes = {...} satisfies Record<string, Route>`),
  `as const` for literal tuples.
- Reuse types instead of duplicating: `ComponentProps<typeof Button>`,
  `z.infer<typeof Schema>`, `Awaited<ReturnType<typeof fetchUser>>`.
- Event types: let inline handlers infer them; otherwise
  `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`.
- Generic components for reusable lists/selects: `function Select<T>(props: SelectProps<T>)`.

## Testing

- Testing Library: query the way users find things — `getByRole('button', { name: 'Save' })`,
  `getByLabelText`, `getByText`; `userEvent` rather than `fireEvent`; `findBy*` for
  async results.
- Test behavior (what the user sees and does), not implementation details (state
  values, hook calls, class names).
- Mock the network at the boundary (MSW) instead of mocking your own hooks.

## Code examples

`references/patterns.md` has tested snippets: a typed Button with variants, a
compound component, a context with a safe hook, a reducer, TanStack Query fetching
and mutation, `useActionState` and react-hook-form + zod forms, an abortable effect,
`useSyncExternalStore` for browser APIs, an error boundary, and component tests.
Read it when you need the exact shape of one of these.

## Review checklist

- [ ] No derived state, no state copied from props, no effect that could be an
      event handler or a `key`
- [ ] Effects have cleanups and complete dependency lists; async work handles races
- [ ] Loading, error and empty states exist and look intentional
- [ ] Lists have stable keys; no components defined inside components
- [ ] Props typed precisely (unions, no `any`); runtime data validated at the boundary
- [ ] Interactive elements are real `<button>`/`<a>`/`<input>` with accessible names
- [ ] `'use client'` only where needed (Next.js)
- [ ] Tests cover the behavior that changed
