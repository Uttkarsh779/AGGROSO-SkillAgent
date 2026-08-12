# INTERVIEW_PREP.md — Project Interview Preparation

This file is for developer study before the project-overview interview. It covers only decisions that actually exist in this implementation.

---

## 1. One-Minute Project Explanation

"I built a platform where users can define reusable AI-powered workflows called 'skills'. Each skill specifies what tools the AI agent can use, what input it takes, what output it produces, and critically — which actions require human approval before executing. The backend runs a real agent loop, calling Google Gemini to decide what to do next, but all policy enforcement happens on the backend: tool authorization, step limits, cancellation, and idempotent write protection. The LLM provides intelligence; the backend provides control. Users can create, version, and run skills, and watch the full execution trace in real time."

---

## 2. Problem Statement

Current AI agent frameworks give too much power to the LLM. If you let the model decide what to run and then run it directly, you lose control over what gets executed, when, and with what side effects. For enterprise or production use cases, you need:
- **Tool boundaries**: agents should only access what they're authorized to
- **Human oversight**: write operations should require approval
- **Auditability**: every decision and action must be logged
- **Versioned reproducibility**: you need to know exactly what configuration ran when

This platform solves those problems by making skills explicit, bounded, and versioned, with a backend that enforces every constraint.

---

## 3. Product Decisions

**Why let users define skills instead of having fixed agents?**
Reusability. A "Customer Issue Resolver" skill can be shared, versioned, improved over time, and re-run against historical configurations.

**Why immutable published versions?**
If you change an agent's behavior after it has run in production, you lose the ability to understand or reproduce what happened. Published versions are frozen.

**Why human approval for write actions?**
Write actions have real consequences (creating tasks, sending notifications, modifying records). Humans should explicitly authorize these in an AI-driven context.

---

## 4. Architecture

**Frontend**: React + Vite + Tailwind CSS. Communicates with backend via REST (axios). Uses polling (2s interval) to track execution state.

**Backend**: Node.js + Express. Contains the agent engine, tool registry, policy checker, approval manager, and all business logic.

**Database**: MongoDB via Mongoose. Five collections: skills, skill_versions, executions, approvals, created_tasks.

**Gemini**: Called only from the backend via `@google/genai` (with automatic model discovery for active models like `gemini-3.6-flash`). The API key never reaches the frontend. Gemini provides structured JSON responses indicating either a tool call or a final answer.

**Agent Engine**: The core orchestration loop (`agentEngine.js`). Calls Gemini, parses the response, runs policy checks, executes tools (or creates approvals), stores results, and loops until final or terminal state.

**Tool Registry**: Central registry (`registry.js`) with 4 tools. Every tool call is validated against this registry before execution.

**Approval Manager**: Creates approval records, pauses execution, resumes after human decision, enforces idempotency.

**Execution Manager**: Routes live via Express; executions are MongoDB documents updated in place as the agent runs.

---

## 5. Agent Workflow — Complete Lifecycle

1. User submits input via the Skill Tester page
2. Backend validates input against the skill version's `inputSchema`
3. An `Execution` document is created in MongoDB with `status=RUNNING`
4. The agent loop begins: Gemini is called with the skill instructions, tool definitions, and conversation history
5. Gemini responds with a structured JSON: either `{type:"tool_call", tool:"...", arguments:{...}, reason:"..."}` or `{type:"final", output:"..."}`
6. If `tool_call`: backend runs policy checks (tool exists? allowed? not cancelled? within maxSteps?)
7. If approval required: create `Approval` record, set execution to `WAITING_APPROVAL`, return — frontend polls and shows approval UI
8. After human decision: if approved, execute exactly once (idempotency check); if rejected, inform agent and continue
9. If no approval needed: execute tool, handle retries, store step result
10. Tool result is fed back to Gemini as the next message
11. Loop repeats until `type=final` or terminal condition (cancelled, maxSteps, failed)
12. On completion, `finalOutput` is stored and `status=COMPLETED`

---

## 6. Why Gemini?

- Free tier availability made it suitable for a hiring assessment
- Strong structured output support (JSON mode + function calling)
- Model configurable via `GEMINI_MODEL` env var — can be changed without touching application code
- The LLM provider is entirely replaceable: the Gemini client is wrapped in `geminiClient.js`; swapping to OpenAI or Anthropic only requires changing that file

---

## 7. Why Custom Orchestration Instead of LangChain/CrewAI?

LangChain and similar frameworks abstract away the parts that matter most for this use case: policy enforcement, approval flows, and idempotency. If we used LangChain:
- We'd still need to wrap it entirely to enforce backend policies
- The framework would execute tool calls without our approval mechanism
- The LLM could potentially influence which tools are called via framework internals
- Debugging and auditability would be harder

Custom orchestration means every policy check is explicit, every decision is visible, and there are no framework-internal calls that could bypass our constraints.

---

## 9. Approval Idempotency — Verified Implementation

**Mechanism Used**: Dual-layer idempotency protection (database-level unique constraint + atomic lock claim).

1. **Idempotency Key Generation**: Each approval generates a deterministic `idempotencyKey = "${executionId}_${stepIndex}"` stored in MongoDB with a unique index. Duplicate approval requests for the same step return the existing approval document (`createApproval()`).
2. **Atomic Execution Lock**: `executeApprovedAction()` in `approvalManager.js` uses MongoDB's atomic `findOneAndUpdate`:
   ```javascript
   const claimed = await Approval.findOneAndUpdate(
     { _id: approvalId, executedAt: { $exists: false }, executing: { $ne: true } },
     { $set: { executing: true, status: 'APPROVED', decidedAt: new Date() } },
     { new: true }
   );
   ```
3. **Concurrent Request Handling**: If two simultaneous HTTP requests (`Req A` and `Req B`) call `POST /approvals/:id/approve` at the exact same millisecond:
   - `Req A` succeeds in setting `executing: true` and executes `tool.execute(...)`.
   - `Req B` receives `claimed === null`, waits briefly for `executedAt` to be populated, and returns `Req A`'s stored result without re-executing `tool.execute(...)`.
   - Result: **EXACTLY ONE side-effect task is created in MongoDB**.
4. **Test Verification**: Verified in `tests/approvals.test.js` via sequential double-clicks (`Test 4`), post-completion retries (`Test 5`), and simultaneous `Promise.all` concurrent execution (`Test 6`).

---

## 10. Agent Engine — Verified Implementation

**Orchestration Loop**: Implemented in `agentEngine.js`.

1. **Execution Lifecycle**:
   - `runAgentLoop(executionId)` re-fetches the execution status before every step.
   - If status is `CANCELLED`, loop terminates immediately.
   - If `currentStep >= skillVersion.maxSteps`, execution terminates with `STEP_LIMIT_EXCEEDED`.
2. **Gemini Client & Response Parsing**:
   - Calls `callGemini(skillVersion, conversationHistory)` via `@google/genai` SDK with structured JSON output response mode.
   - Parses response into `{ type: "tool_call", tool: "...", arguments: {...} }` or `{ type: "final", output: "..." }`.
3. **Policy Checks**:
   - Every `tool_call` passes through `checkToolCallPolicy()` BEFORE execution.
   - Verifies tool exists in global registry and is listed in `skillVersion.allowedTools`.
   - If tool requires approval (`requiresApproval()`), creates an `Approval` record, sets status to `WAITING_APPROVAL`, and pauses loop.
4. **Result Feedback & Retries**:
   - Tool execution failure retries up to 3 times for retryable errors (`executeToolWithRetry()`).
   - Tool output is appended to conversation history and fed back to Gemini for the next step decision.
5. **Test Verification**: Verified in `tests/agentEngine.test.js` using offline deterministic mocks for basic loop, unauthorized tool rejection, unknown tool rejection, step limit termination, pre-cancellation, and write tool approval pause/resume boundary.

---
2. Look up `tool` in the Tool Registry (`registry.get(tool)`) — if not found, return structured error to LLM
3. Check `skillVersion.allowedTools.includes(tool)` — if not, return structured error to LLM
4. If it's a write tool: check `skillVersion.approvalRequiredActions.includes(tool)` — if yes, trigger approval flow
5. Check `execution.status !== 'CANCELLED'` — if cancelled, stop
6. Check `execution.currentStep < skillVersion.maxSteps` — if exceeded, fail

This happens BEFORE any tool execution. The LLM cannot bypass it by any means.

---

## 9. Human Approval

Why: Write actions have real-world side effects. In an AI-driven context, humans should verify what the agent is about to do before it does it.

How:
1. When policy check identifies `approvalRequiredActions` contains the requested tool
2. `approvalManager.createApproval()` creates an `Approval` document (status=PENDING)
3. Execution is set to `WAITING_APPROVAL` and the agent loop returns (pauses)
4. Frontend polls `/executions/:id` and sees `WAITING_APPROVAL`
5. Frontend fetches `/executions/:id/approvals` and renders the ApprovalPanel
6. Human clicks Approve or Reject
7. `POST /approvals/:id/approve` or `/reject` is called
8. If approved: `approvalManager.executeApprovedAction()` runs with idempotency check
9. Execution status returns to `RUNNING`, agent loop resumes with the tool result

The LLM has no path to execute a write action without going through this flow. Even if it claims no approval is needed, the backend's `approvalRequiredActions` list is the ground truth.

---

## 10. Idempotency

Problem: A user double-clicks "Approve", or the frontend retries a failed HTTP request. We cannot create two tasks.

Solution:
- Each `Approval` record has `idempotencyKey = "${executionId}_${stepIndex}"` (unique per execution step)
- Before executing the write action, check if `approval.executedAt` is already set
- If set: return `approval.result` (the stored previous result) without re-executing
- If not set: execute the write, then set `approval.executedAt = new Date()` and `approval.result = result` atomically

The database is the source of truth. Multiple HTTP calls for the same approval ID are safe.

---

## 11. Versioning

- `Skill` is the parent entity (name, purpose, status, currentVersion number)
- `SkillVersion` is the immutable snapshot (all configuration including schemas, tools, instructions)
- Status flow: `draft` -> `published` (one-way, immutable once published)
- Creating a skill always creates `version 1` as `draft`
- Publishing a draft sets it to `published` and updates `skill.currentVersion`
- Editing a published skill creates a new `draft` version (increment version number)
- Executions store both `skillVersionId` (ObjectId) and `versionNumber` for display
- Re-running a historical version: `POST /skills/:id/execute` with `{versionNumber: 1}` in body — agent engine loads that specific `SkillVersion` document

---

## 12. Failure Handling

**Tool failure**: Caught in the agent loop. If `retryable=true` on the error, retry up to 3 times with exponential backoff. If still failing, set execution to `FAILED` with error message.

**Gemini failure**: HTTP error or malformed response. Retry the LLM call up to 2 times. If still failing, set execution to `FAILED`.

**Retry**: Each retry attempt is recorded as a step entry with `status=retrying` and `retryCount` incremented.

**Cancellation**: `POST /executions/:id/cancel` sets `execution.status=CANCELLED` in the database. The agent loop checks status before every tool call and before every LLM call. If cancelled, it stops immediately.

**Max steps**: `execution.currentStep` is incremented before each tool execution. If `currentStep >= skillVersion.maxSteps`, the execution fails with a `STEP_LIMIT_EXCEEDED` error.

**Malformed LLM response**: Gemini sometimes returns plain text instead of JSON. The client attempts JSON extraction, then retries the LLM call (up to 2 times), then fails the execution.

---

## 13. Database Design

**`skills`**: The parent entity. Exists to give executions and versions a stable reference point. Tracks the latest published version number.

**`skill_versions`**: The actual configuration. Contains everything the agent needs to run. Immutable once published. We query this by `skillId + versionNumber` when re-running historical versions.

**`executions`**: The audit trail. Every execution step (LLM decisions, tool calls, approvals) is embedded as an array. Updated in place as the agent runs. Frontend polls this to show live progress.

**`approvals`**: Separate from executions because approvals are a human workflow. They have their own status lifecycle (PENDING -> APPROVED/REJECTED). Idempotency key lives here. The `executedAt` field is the idempotency guard.

**`created_tasks`**: Separate collection so mock tasks can be queried independently for display, even if the approval record is deleted or archived. Linked back to `approvalId` and `executionId`.

---

## 14. API Design

**Skills CRUD**: Standard REST on `/api/skills`. PUT on an existing published skill triggers version creation logic.

**Versions**: `/api/skills/:id/versions` lists all versions. Compare endpoint: `/api/skills/:id/versions/compare?v1=1&v2=2` returns both versions for diff display.

**Execute**: `POST /api/skills/:id/execute` with optional `{versionNumber: N}` to target a historical version. Returns the execution ID immediately (async - client polls for updates).

**Executions**: `GET /api/executions/:id` returns the full execution document including steps. Frontend polls this.

**Cancel**: `POST /api/executions/:id/cancel` - sets status in DB; agent loop picks it up on next cycle.

**Approvals**: `POST /api/approvals/:id/approve` runs the idempotency check, executes the write if safe, resumes the agent loop. `POST /api/approvals/:id/reject` marks rejected and resumes agent.

---

## 15. Testing

Tests are organized around the 15 behavioral requirements from the assignment:
- `tools.test.js`: Calculator evaluates correctly, unknown tool returns error, math safety
- `policyChecker.test.js`: Unauthorized tool rejected, max steps enforced, cancelled execution stops
- `skillValidator.test.js`: Invalid schema fails publish, missing fields fail publish, valid skill publishes
- `agentEngine.test.js`: Complete loop with mock Gemini, step recording, final output storage
- `approvals.test.js`: Idempotency (double approve), rejection (no write), approval executes once

These tests matter because they verify the security-critical policy boundaries — not just happy-path functionality.

---

## 16. Deployment

- **MongoDB Atlas**: Free M0 cluster. Connection string in `MONGODB_URI` env var.
- **Backend on Render**: Free tier web service. Environment variables configured in Render dashboard. `npm start` serves Express.
- **Frontend on Vercel**: Auto-deploys from GitHub. `VITE_API_URL` points to Render backend URL.

Separation: Frontend never connects to MongoDB. Backend is the only service with database access. Gemini API key is only in backend env vars.

---

## 17. Security

**Secrets**: API keys and DB credentials are only in `.env` files (not committed). `.gitignore` includes `.env`. `.env.example` has placeholder values only.

**Tool permissions**: Every tool call validated against `allowedTools` in the skill version before execution. This is backend-enforced; the LLM cannot override it.

**Backend-only API key**: `GEMINI_API_KEY` is only in the backend environment. The frontend never sees it. Gemini calls are proxied through our Express backend.

**Arbitrary code prevention**: Calculator uses `mathjs` (safe math parser). No `eval()`. No `Function()` constructor. No `require()` from LLM input.

**Database access restrictions**: The LLM can only request `record_lookup` with a `collection` name and `id`. The tool validates the collection name against a whitelist (`["customers","orders","support_tickets"]`). No arbitrary queries.

---

## 18. Known Limitations

- No authentication (single-user MVP)
- Polling-based execution updates (2s interval); not real-time
- Document search is keyword-based; not suitable for large knowledge bases
- No rate limiting on the Express API
- Execution steps are stored in-document in MongoDB (fine for demo scale, would need separate collection at scale)
- Gemini model fallback is retry-based, not failover to another provider

---

## 19. Trade-offs

| Decision | Alternative | Why We Chose This |
|----------|-----------|------------------|
| Polling instead of WebSockets | Socket.io real-time | Simpler, no Render WebSocket issues, sufficient for demo |
| Keyword document search | Vector RAG (Pinecone) | 4 documents; vector DB adds complexity without benefit |
| 4 bounded tools | Open tool set | Security; LLM cannot call arbitrary functions |
| Simple retry (max 3) | Exponential backoff frameworks | Bounded, predictable, easy to understand and test |
| No auth | JWT + refresh tokens | Out of scope; authentication is not what's being evaluated |
| Custom agent loop | LangChain | Full control over policy enforcement; no framework bypass risk |
| Approval resumes inline | Queue-based resume | Simpler state management; sufficient for single-server demo |

---

## 20. Likely Interviewer Questions

### Q: How does the agent know what tools to use?
**A**: We pass the tool registry definitions (name, description, input schema) to Gemini as part of the system prompt. Gemini responds with a structured JSON indicating which tool to call and why. The backend then validates and executes it.
**Code**: `backend/src/engine/geminiClient.js`, `backend/src/tools/registry.js`
**Why**: Structured output (JSON mode) prevents the LLM from producing arbitrary text that we'd need to parse unreliably.

### Q: What happens if Gemini returns an unauthorized tool?
**A**: The policy checker checks `skillVersion.allowedTools.includes(toolName)`. If the tool is not in the list, we do NOT execute it. We return a structured error message that gets fed back to Gemini: "Tool X is not authorized for this skill." Gemini then decides what to do next (usually picks an authorized tool or gives a final answer).
**Code**: `backend/src/engine/policyChecker.js`
**Why**: The LLM should never be trusted to self-report its permissions.

### Q: How do you prevent a double-click from creating two tasks?
**A**: The approval record has an `idempotencyKey` (executionId + stepIndex) and an `executedAt` timestamp. Before executing the write, we check if `executedAt` is already set. If it is, we return the stored result immediately without re-executing. The HTTP handler also guards against concurrent requests to the same approval ID.
**Code**: `backend/src/engine/approvalManager.js`
**Why**: Database-level idempotency is more reliable than client-side disabling alone.

### Q: What happens if the user cancels mid-execution?
**A**: `POST /executions/:id/cancel` sets the execution's `status` to `CANCELLED` in MongoDB. The agent loop checks `execution.status` before every Gemini call and before every tool execution. If it sees `CANCELLED`, it stops and returns immediately without executing further actions.
**Code**: `backend/src/engine/agentEngine.js`, `backend/src/routes/executions.js`
**Why**: The database is the single source of truth for execution state. The loop never trusts local state alone.

### Q: How do you re-run a historical skill version?
**A**: When executing, the client can pass `{versionNumber: 1}` in the request body. The backend looks up `SkillVersion.findOne({skillId, versionNumber: 1})` — this is the exact frozen configuration from when that version was published. The agent runs with those constraints, not the current version.
**Code**: `backend/src/routes/skills.js` (execute endpoint), `backend/src/engine/agentEngine.js`
**Why**: Version immutability is what makes historical re-runs meaningful and reproducible.

### Q: How is the approval flow resumed after a human decision?
**A**: When the user clicks Approve, `POST /approvals/:id/approve` is called. The handler executes the approved action (with idempotency check), stores the result on the approval record, updates the execution status back to `RUNNING`, re-enters the agent loop with the tool result, and continues from where it left off.
**Code**: `backend/src/engine/approvalManager.js`
**Why**: Keeping the resume logic server-side means the frontend cannot manipulate what happens after approval.

### Q: Why doesn't the LLM have more control over the execution?
**A**: Because the LLM is an untrusted external service. It can be wrong, adversarially prompted, or produce unexpected output. All safety-critical decisions (which tools exist, whether approval is needed, when to stop) are enforced by backend code that the LLM cannot influence.

---

## 21. Code Agent Usage Questions

### Q: Why did you use coding agents?
**A**: For a hiring assessment with a broad scope, agents help scaffold boilerplate quickly so I can focus on the architecture decisions and security-critical logic that demonstrate real engineering judgment.

### Q: What did the agent generate?
**A**: File scaffolding, Express route boilerplate, Mongoose schema drafts, React component structure, test file templates, and documentation drafts.

### Q: What did you personally verify?
**A**: The agent engine orchestration loop (every branch), the policy checker (all conditions), the approval manager (idempotency logic), the Gemini client (response parsing, fallback behavior), and all test assertions.

### Q: What mistakes did the agent make?
**A**: See `AGENT_USAGE.md` — key mistakes were: proposing arbitrary tool execution via dynamic require(), proposing eval() for the calculator, and proposing sending the full MongoDB document to Gemini on each iteration.

### Q: Which suggestions did you reject?
**A**: See `AGENT_USAGE.md` — key rejections were: LangChain/CrewAI (too much abstraction), WebSockets (unnecessary complexity), vector DB (overkill for 4 docs), storing API key in frontend.

### Q: How did you ensure you understood the generated code?
**A**: By reviewing every file before committing, writing tests that exercise the generated logic with edge cases, and being able to explain every architectural decision from first principles.
