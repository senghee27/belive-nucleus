# Skill: Anthropic API Patterns for Nucleus Agents

## Client Setup
```typescript
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
```

## Standard Agent Call
```typescript
const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }]
})

const text = msg.content[0].type === 'text'
  ? msg.content[0].text
  : ''
```

## JSON Response Pattern
When you need structured output:
```typescript
// In system prompt always add:
// "Respond ONLY in valid JSON. No markdown, no backticks, no explanation."

const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'

try {
  const parsed = JSON.parse(text)
  return parsed
} catch {
  console.error('[agent:parse]', 'Failed to parse JSON', text)
  throw new Error('Agent returned invalid JSON')
}
```

## Model to Use
Always: claude-sonnet-4-6
Never change this without Lee's approval

## Token Budget
- Classify: max_tokens 300
- Propose: max_tokens 1024
- PRD writing: max_tokens 4096
- Morning briefing: max_tokens 2048

## Rules
- Always validate JSON parse with try/catch
- Always log the raw text before parsing for debugging
- Never use streaming for Nucleus (keep it simple)
- System prompt always includes BeLive context
