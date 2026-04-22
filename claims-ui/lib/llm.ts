import "server-only"
import { traceable } from "langsmith/traceable"

const OR_BASE = "https://openrouter.ai/api/v1/chat/completions"

function orHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": "https://shipbob-claims.local",
    "X-Title": "ShipBob Claims",
  }
}

async function _orChat(
  model: string,
  messages: object[],
  jsonMode = false,
  maxTokens = 512
): Promise<string> {
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens }
  if (jsonMode) body.response_format = { type: "json_object" }

  const res = await fetch(OR_BASE, {
    method: "POST",
    headers: orHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

// Wrapped with LangSmith tracing.
// No-ops gracefully when LANGCHAIN_TRACING_V2 is not "true".
export const orChat = traceable(_orChat, {
  name: "orChat",
  run_type: "llm",
  tags: ["openrouter"],
})
