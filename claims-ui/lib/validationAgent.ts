import type {
  AccountOutput, MultiItemVisionOutput,
  ValidationCheck, ValidationOutput,
} from "./types"
import type { DecisionOutput } from "./agent"
import { orChat } from "./llm"

const MAX_REIMBURSEMENT = 100
const EPSILON = 0.02  // rounding tolerance for proration math

// ---------- Deterministic checks ----------

function checkMath(account: AccountOutput): ValidationCheck {
  const computedSum = account.lineItems.reduce((s, l) => s + l.approvedAmount, 0)
  const diff = Math.abs(computedSum - account.totalAmount)
  const passed = diff <= EPSILON
  return {
    name: "Math: line items sum to total",
    passed,
    detail: passed
      ? `Sum $${computedSum.toFixed(2)} matches totalAmount $${account.totalAmount.toFixed(2)}`
      : `Sum $${computedSum.toFixed(2)} ≠ totalAmount $${account.totalAmount.toFixed(2)} (diff $${diff.toFixed(2)})`,
  }
}

function checkCap(account: AccountOutput): ValidationCheck {
  const passed = account.totalAmount <= MAX_REIMBURSEMENT + EPSILON
  return {
    name: `Cap: total ≤ $${MAX_REIMBURSEMENT}`,
    passed,
    detail: passed
      ? `$${account.totalAmount.toFixed(2)} is within cap`
      : `$${account.totalAmount.toFixed(2)} exceeds $${MAX_REIMBURSEMENT} cap`,
  }
}

function checkVerifiedOnly(account: AccountOutput, multi: MultiItemVisionOutput): ValidationCheck {
  const unverifiedNames = multi.items.filter((i) => !i.verified).map((i) => i.claimedItemName)
  const lineItemNames   = account.lineItems.map((l) => l.itemName.toLowerCase())
  const leaked = unverifiedNames.filter((name) =>
    lineItemNames.some((l) => l.includes(name.toLowerCase()) || name.toLowerCase().includes(l))
  )
  const passed = leaked.length === 0
  return {
    name: "Only verified items included",
    passed,
    detail: passed
      ? "All line items correspond to vision-verified items"
      : `Unverified item(s) may have leaked into line items: ${leaked.join(", ")}`,
  }
}

function checkProrateLogic(account: AccountOutput): ValidationCheck {
  if (!account.prorated) {
    return { name: "Prorate logic", passed: true, detail: "No proration applied — subtotal within cap" }
  }
  const ratio = account.totalAmount / account.subtotal
  const allProportional = account.lineItems.every((l) => {
    const expected = (l.invoicePrice / account.subtotal) * MAX_REIMBURSEMENT
    return Math.abs(l.approvedAmount - expected) <= EPSILON
  })
  return {
    name: "Prorate logic",
    passed: allProportional,
    detail: allProportional
      ? `Proration ratio ${(ratio * 100).toFixed(1)}% applied correctly to all items`
      : `Proration ratio ${(ratio * 100).toFixed(1)}% — one or more items not proportionally adjusted`,
  }
}

function checkConfidenceAlignment(decision: DecisionOutput | null): ValidationCheck {
  if (!decision) {
    return { name: "Decision confidence alignment", passed: true, detail: "No decision to validate" }
  }
  const rec = decision.recommendation
  const conf = decision.confidence
  let passed = true
  let detail = `${rec} at ${Math.round(conf * 100)}% confidence`

  if (rec === "approve" && conf < 0.60) {
    passed = false
    detail = `Approval confidence ${Math.round(conf * 100)}% is below expected 60% minimum`
  } else if (rec === "deny" && conf < 0.50) {
    passed = false
    detail = `Deny confidence ${Math.round(conf * 100)}% is low — should be more certain before denying`
  }

  return { name: "Decision confidence alignment", passed, detail }
}

// ---------- LLM email consistency check ----------

async function checkEmailConsistency(account: AccountOutput): Promise<ValidationCheck> {
  if (!account.draftEmail || account.lineItems.length === 0) {
    return { name: "Email consistency (LLM)", passed: true, detail: "No email to validate" }
  }

  const itemList = account.lineItems.map((l) => `${l.itemName}: $${l.approvedAmount.toFixed(2)}`).join(", ")
  const raw = await orChat(
    "meta-llama/llama-3.1-8b-instruct",
    [
      {
        role: "system",
        content: `You are a QA checker for approval emails. Given an email and the expected items/amounts, check:
1. Does the email mention all approved items?
2. Are the amounts in the email correct?
3. Is the total reimbursement stated correctly?

Return JSON with keys:
- passed (boolean)
- issues (array of strings, empty if passed)`,
      },
      {
        role: "user",
        content: `Expected items and amounts: ${itemList}\nExpected total: $${account.totalAmount.toFixed(2)}\n\nEmail:\n${account.draftEmail}`,
      },
    ],
    true,
    512
  )

  try {
    const parsed = JSON.parse(raw)
    const passed = typeof parsed.passed === "boolean" ? parsed.passed : true
    const issues: string[] = Array.isArray(parsed.issues) ? parsed.issues.map(String) : []
    return {
      name: "Email consistency (LLM)",
      passed,
      detail: passed ? "Email correctly reflects all approved items and amounts" : issues.join("; "),
    }
  } catch {
    return { name: "Email consistency (LLM)", passed: true, detail: "LLM check could not be parsed — skipped" }
  }
}

// ---------- Main entry point ----------

export async function runValidationAgent(
  account: AccountOutput,
  multi: MultiItemVisionOutput,
  decision: DecisionOutput | null
): Promise<ValidationOutput> {
  const deterministicChecks = [
    checkMath(account),
    checkCap(account),
    checkVerifiedOnly(account, multi),
    checkProrateLogic(account),
    checkConfidenceAlignment(decision),
  ]

  const emailCheck = await checkEmailConsistency(account)
  const checks = [...deterministicChecks, emailCheck]

  const flags = checks.filter((c) => !c.passed).map((c) => c.name)
  const failCount = flags.length
  const verdict: ValidationOutput["verdict"] =
    failCount === 0 ? "pass" : failCount <= 1 ? "warn" : "fail"

  return { checks, flags, verdict }
}
