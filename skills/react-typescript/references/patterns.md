# React + TypeScript patterns

Tested with React 19, TypeScript 6, TanStack Query 5, react-hook-form 7,
@hookform/resolvers 5, zod 4, react-error-boundary 6, Vitest + Testing Library + MSW 2.
If the project pins older majors, check the installed versions before copying.

Contents
1. Button with variants
2. Compound component (Disclosure)
3. Context with a safe hook
4. Reducer with exhaustive actions
5. Data fetching with TanStack Query
6. Form with `useActionState`
7. Form with react-hook-form + zod
8. Effects: abortable fetch, `useEffectEvent`, `useSyncExternalStore`
9. Error boundary
10. Tests (Testing Library, MSW)

---

## 1. Button with variants

```tsx
// src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

```tsx
// src/components/ui/Button.tsx
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border border-border bg-surface text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'bg-danger text-white hover:bg-danger/90',
} as const

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4',
  lg: 'h-12 px-6 text-lg',
} as const

type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  loading?: boolean
}

// `ref` arrives through props in React 19 — no forwardRef needed.
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  )
}
```

`type="button"` by default prevents accidental form submits. `cn` lets callers
override classes (`<Button className="w-full">`) without specificity fights. The
color classes assume semantic tokens (`bg-primary`, …) defined in the theme — see the
tailwind-css skill.

## 2. Compound component (Disclosure)

Sub-components share state through context; the parent owns it.

```tsx
// src/components/ui/Disclosure.tsx
import { createContext, use, useId, useState, type ComponentProps, type ReactNode } from 'react'

type DisclosureState = { open: boolean; toggle: () => void; panelId: string }
const DisclosureContext = createContext<DisclosureState | null>(null)

function useDisclosure() {
  const ctx = use(DisclosureContext)
  if (!ctx) throw new Error('Disclosure.* must be used inside <Disclosure>')
  return ctx
}

export function Disclosure({ defaultOpen = false, children }: { defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <DisclosureContext value={{ open, toggle: () => setOpen((o) => !o), panelId }}>
      {children}
    </DisclosureContext>
  )
}

function Trigger({ children, ...props }: ComponentProps<'button'>) {
  const { open, toggle, panelId } = useDisclosure()
  return (
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle} {...props}>
      {children}
    </button>
  )
}

function Panel({ children, ...props }: ComponentProps<'div'>) {
  const { open, panelId } = useDisclosure()
  return (
    <div id={panelId} hidden={!open} {...props}>
      {children}
    </div>
  )
}

Disclosure.Trigger = Trigger
Disclosure.Panel = Panel
```

```tsx
<Disclosure>
  <Disclosure.Trigger>Shipping details</Disclosure.Trigger>
  <Disclosure.Panel>Ships in 2–3 business days.</Disclosure.Panel>
</Disclosure>
```

In React 19, `<Context value>` is the provider and `use(Context)` reads it (also
allowed conditionally). Older code uses `<Context.Provider>` / `useContext` — both
still work.

## 3. Context with a safe hook

```tsx
// src/features/theme/ThemeProvider.tsx
import { createContext, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void }

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  // Stable value object: consumers re-render only when `theme` changes.
  // (Unnecessary when React Compiler is on.)
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext value={value}>{children}</ThemeContext>
}
```

```tsx
// src/features/theme/useTheme.ts — separate file keeps Fast Refresh happy
import { use } from 'react'
import { ThemeContext } from './ThemeProvider'

export function useTheme() {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
```

`null` as the default plus a throwing hook turns "forgot the provider" into a clear
error instead of silent `undefined`s.

## 4. Reducer with exhaustive actions

```tsx
type CartItem = { id: string; name: string; price: number; qty: number }
type CartState = { items: CartItem[] }
type CartAction =
  | { type: 'add'; item: Omit<CartItem, 'qty'> }
  | { type: 'remove'; id: string }
  | { type: 'setQty'; id: string; qty: number }
  | { type: 'clear' }

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const existing = state.items.find((i) => i.id === action.item.id)
      return existing
        ? { items: state.items.map((i) => (i.id === action.item.id ? { ...i, qty: i.qty + 1 } : i)) }
        : { items: [...state.items, { ...action.item, qty: 1 }] }
    }
    case 'remove':
      return { items: state.items.filter((i) => i.id !== action.id) }
    case 'setQty':
      return {
        items: state.items
          .map((i) => (i.id === action.id ? { ...i, qty: action.qty } : i))
          .filter((i) => i.qty > 0),
      }
    case 'clear':
      return { items: [] }
    default: {
      const unreachable: never = action // compile error if a case is missing
      return unreachable
    }
  }
}

// const [cart, dispatch] = useReducer(cartReducer, { items: [] })
// const total = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0)  ← derived, not stored
```

## 5. Data fetching with TanStack Query

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

```tsx
// src/features/users/api.ts
import { z } from 'zod'

export const User = z.object({ id: z.string(), name: z.string(), email: z.email() })
export type User = z.infer<typeof User>

async function request<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${res.status}`)
  return schema.parse(await res.json()) // runtime check: types alone trust the server blindly
}

export const fetchUser = (id: string, signal?: AbortSignal) => request(`/api/users/${id}`, User, { signal })

export const renameUser = (id: string, name: string) =>
  request(`/api/users/${id}`, User, { method: 'PATCH', body: JSON.stringify({ name }) })
```

```tsx
// src/features/users/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUser, renameUser } from './api'

export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => fetchUser(id, signal), // aborted automatically when stale
  })
}

export function useRenameUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameUser(id, name),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.detail(user.id), user)
      return queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}
```

```tsx
// src/features/users/UserCard.tsx
import { useUser } from './hooks'

export function UserCard({ id }: { id: string }) {
  const { data: user, isPending, isError, error, refetch } = useUser(id)

  if (isPending) return <div className="h-20 animate-pulse rounded-lg bg-muted" aria-busy="true" />
  if (isError) {
    return (
      <div role="alert">
        <p>Couldn't load the user. {error.message}</p>
        <button type="button" onClick={() => refetch()}>Try again</button>
      </div>
    )
  }
  return (
    <article>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </article>
  )
}
```

Query keys in one factory keep invalidation consistent. After the `isPending` and
`isError` checks TypeScript knows `user` is defined.

## 6. Form with `useActionState`

Good for simple forms and required for Next.js Server Actions. React resets
uncontrolled fields after an action finishes, so echo the submitted values back to
keep them when validation fails.

```tsx
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { z } from 'zod'

const Signup = z.object({ email: z.email('Enter a valid email address') })

type State = {
  status: 'idle' | 'error' | 'success'
  message?: string
  fieldErrors?: { email?: string }
  values?: { email: string }
}

async function subscribe(_prev: State, formData: FormData): Promise<State> {
  const values = { email: String(formData.get('email') ?? '') }
  const parsed = Signup.safeParse(values)
  if (!parsed.success) {
    return { status: 'error', values, fieldErrors: { email: parsed.error.issues[0]?.message } }
  }
  const res = await fetch('/api/subscribe', { method: 'POST', body: JSON.stringify(parsed.data) })
  if (!res.ok) return { status: 'error', values, message: 'Something went wrong. Please try again.' }
  return { status: 'success', message: 'Check your inbox to confirm.' }
}

function SubmitButton() {
  const { pending } = useFormStatus() // must be rendered inside the <form>
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Subscribing…' : 'Subscribe'}
    </button>
  )
}

export function NewsletterForm() {
  const [state, formAction] = useActionState(subscribe, { status: 'idle' })
  const emailError = state.fieldErrors?.email
  return (
    <form action={formAction} noValidate>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? 'email-error' : undefined}
      />
      {emailError && <p id="email-error">{emailError}</p>}
      <SubmitButton />
      <p role="status">{state.message}</p>
    </form>
  )
}
```

`useActionState` also returns `isPending` as a third element when the pending
state is needed outside the form.

## 7. Form with react-hook-form + zod

For larger forms with field-level validation and many interactions.

```tsx
import { useId, type ComponentProps } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const SignupSchema = z.object({
  name: z.string().min(2, 'Use at least 2 characters'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
})
type SignupValues = z.infer<typeof SignupSchema>

type FieldProps = ComponentProps<'input'> & { label: string; error?: string; hint?: string }

// Label, hint and error wired together for assistive tech.
export function Field({ label, error, hint, id, ...props }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ')
  return (
    <div className="grid gap-1">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} {...props} />
      {hint && <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={`${inputId}-error`} className="text-sm text-danger">{error}</p>}
    </div>
  )
}

export function SignupForm({ onSubmit }: { onSubmit: (values: SignupValues) => Promise<void> }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(SignupSchema), mode: 'onTouched' })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch {
      setError('root', { message: 'Could not create the account. Please try again.' })
    }
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field label="Name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        error={errors.password?.message}
        {...register('password')}
      />
      {errors.root && <p role="alert">{errors.root.message}</p>}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create account'}</button>
    </form>
  )
}
```

`register()` returns `ref` among its props; in React 19 it reaches the `<input>`
through the spread. react-hook-form moves focus to the first invalid field on
submit by default (`shouldFocusError`).

## 8. Effects

**Abortable fetch** (when no data library is available):

```tsx
function useSearch(query: string) {
  const [results, setResults] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: string[]) => {
        setResults(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return // superseded by a newer query
        setError(err instanceof Error ? err : new Error(String(err)))
      })
    return () => controller.abort()
  }, [query])

  return { results: query ? results : [], error }
}
```

Note the empty-query case is derived in the return value instead of calling
`setResults([])` synchronously inside the effect.

**`useEffectEvent`** (React 19.2+): read the latest props inside an effect without
re-subscribing when they change.

```tsx
import { useEffect, useEffectEvent } from 'react'

function useRoomConnection(roomId: string, onMessage: (text: string) => void) {
  const handleMessage = useEffectEvent((text: string) => onMessage(text))

  useEffect(() => {
    const socket = new WebSocket(`wss://chat.example.com/rooms/${roomId}`)
    socket.addEventListener('message', (e) => handleMessage(String(e.data)))
    return () => socket.close()
  }, [roomId]) // reconnects only when the room changes, not when onMessage does
}
```

**`useSyncExternalStore`** for browser state (media queries, online status,
localStorage from other tabs) — no effect + state pair, no tearing:

```tsx
import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // server snapshot
  )
}

// const isDesktop = useMediaQuery('(min-width: 64rem)')
```

## 9. Error boundary

```tsx
import { ErrorBoundary, getErrorMessage, type FallbackProps } from 'react-error-boundary'

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 p-4">
      <p className="font-medium">This section failed to load.</p>
      <p className="text-sm text-muted-foreground">{getErrorMessage(error) ?? 'Unknown error'}</p>
      <button type="button" onClick={() => resetErrorBoundary()}>Try again</button>
    </div>
  )
}

// One boundary per independent region, so a broken widget doesn't blank the page.
<ErrorBoundary FallbackComponent={ErrorFallback} onError={(error) => reportError(error)}>
  <RevenueChart />
</ErrorBoundary>
```

Error boundaries catch render errors, not errors in event handlers or async code —
handle those with try/catch and state (or TanStack Query's `isError`).

## 10. Tests

```tsx
// src/components/ui/Disclosure.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { Disclosure } from './Disclosure'

it('shows the panel when the trigger is clicked', async () => {
  const user = userEvent.setup()
  render(
    <Disclosure>
      <Disclosure.Trigger>Shipping details</Disclosure.Trigger>
      <Disclosure.Panel>Ships in 2–3 business days.</Disclosure.Panel>
    </Disclosure>,
  )
  const trigger = screen.getByRole('button', { name: 'Shipping details' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText(/ships in/i)).not.toBeVisible()

  await user.click(trigger)

  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/ships in/i)).toBeVisible()
})
```

**Mocking the network with MSW.** In Vitest's `jsdom` environment relative URLs
like `/api/users/1` resolve against `http://localhost:3000`, and MSW handlers can
use the same relative paths. (Tests running with `environment: 'node'` have no base
URL — plain Node `fetch('/api/…')` throws — so use absolute URLs there.)

```tsx
// src/test/server.ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const server = setupServer(
  http.get('/api/users/:id', ({ params }) =>
    HttpResponse.json({ id: params.id, name: 'Ada Lovelace', email: 'ada@example.com' }),
  ),
)
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```tsx
// src/features/users/UserCard.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { server } from '@/test/server'
import { UserCard } from './UserCard'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }) // fresh cache per test
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

it('renders the user', async () => {
  renderWithClient(<UserCard id="1" />)
  expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
})

it('offers a retry when loading fails', async () => {
  server.use(http.get('/api/users/:id', () => new HttpResponse(null, { status: 500 })))
  renderWithClient(<UserCard id="1" />)
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
})
```
