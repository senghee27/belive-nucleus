# Skill: Error Handling Patterns

## API Routes
```typescript
try {
  // ...
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error('[context]', message)
  return NextResponse.json({ error: message }, { status: 500 })
}
```

## Supabase Queries
```typescript
const { data, error } = await supabaseAdmin
  .from('decisions')
  .select('*')
  .single()

if (error) {
  console.error('[decisions:fetch]', error.message)
  throw new Error(error.message)
}

if (!data) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

## Client Components
```typescript
const [error, setError] = useState<string | null>(null)
const [loading, setLoading] = useState(false)

async function handleAction() {
  setLoading(true)
  setError(null)
  try {
    await doSomething()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Something went wrong')
  } finally {
    setLoading(false)
  }
}
```

## Rules
- Never silent catch: catch(e) {}
- Always log with context: console.error('[file:function]', error)
- Always show error state in UI
- Always reset loading state in finally block
