import "server-only"

const OR_BASE = "https://openrouter.ai/api/v1/chat/completions"
const LS_BASE = "https://api.smith.langchain.com"

function orHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": "https://shipbob-claims.local",
    "X-Title": "ShipBob Claims",
  }
}

// Fire-and-forget trace to LangSmith REST API — no SDK, no async_hooks.
function logRun(data: {
  name: string
  model: string
  inputs: object
  outputs: object
  start_time: number
  end_time: number
  error?: string
}) {
  const apiKey = process.env.LANGCHAIN_API_KEY
  if (!apiKey || process.env.LANGCHAIN_TRACING_V2 !== "true") return

  const body = JSON.stringify({
    id:           crypto.randomUUID(),
    name:         data.name,
    run_type:     "llm",
    inputs:       data.inputs,
    outputs:      data.outputs,
    start_time:   data.start_time,
    end_time:     data.end_time,
    error:        data.error,
    session_name: process.env.LANGCHAIN_PROJECT ?? "shipbob-claims",
    extra:        { metadata: { model: data.model, provider: "openrouter" } },
  })

  fetch(`${LS_BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body,
  }).catch(() => {}) // non-fatal
}

export async function orChat(
  model: string,
  messages: object[],
  jsonMode = false,
  maxTokens = 512
): Promise<string> {
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens }
  if (jsonMode) body.response_format = { type: "json_object" }

  const startTime = Date.now()
  let output = ""
  let errorMsg: string | undefined

  try {
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
    output = data.choices?.[0]?.message?.content ?? ""
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
    logRun({ name: model, model, inputs: { messages }, outputs: {}, start_time: startTime, end_time: Date.now(), error: errorMsg })
    throw err
  }

  logRun({ name: model, model, inputs: { messages }, outputs: { content: output }, start_time: startTime, end_time: Date.now() })
  return output
}
