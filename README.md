# Dynamic User-Defined Skills Agent Platform

A web application that lets users create and run reusable **AI-powered "skills"** — constrained agent workflows powered by Google Gemini, with human-in-the-loop approval, full execution tracing, and versioned skill management.

---

## Product Overview

A **Skill** is a user-defined configuration that tells an AI agent:
- What its purpose is
- What input it expects (JSON Schema)
- What output it should produce
- Which tools it is allowed to use
- Which of those tools require human approval before execution
- How many steps the agent can take before being stopped

Users create skills, publish versioned snapshots, then run them against real input. The backend enforces every constraint — the LLM provides intelligence, the backend provides control.

---

## Architecture

```
FRONTEND (React + Vite + Tailwind)
        |  REST API (axios polling)
        v
BACKEND (Node.js + Express)
        |
        +- AGENT ENGINE (orchestration loop)
        |       |
        |       +- POLICY CHECKER (auth, steps, cancel, idempotency)
        |       +- APPROVAL MANAGER (create/resume approval flows)
        |       +- GEMINI CLIENT (structured LLM calls)
        |
        +- TOOL REGISTRY (4 bounded tools)
        |       +- calculator
        |       +- document_search
        |       +- record_lookup
        |       +- mock_task_creator  [WRITE - requires approval]
        |
        +- MONGOOSE ODM
                |
                v
        MONGODB ATLAS
        +- skills
        +- skill_versions
        +- executions
        +- approvals
        +- created_tasks
```

---

## Agent Workflow

```
User submits input
        |
Validate input against skill's inputSchema
        |
Create Execution record (status=RUNNING)
        |
Call Gemini with instructions + tool definitions <--------------+
        |                                                        |
Parse structured JSON response                                   |
        |                                                        |
   type=final ---------------------------------> Store output, COMPLETE
        |                                                        |
   type=tool_call                                               |
        |                                                        |
  POLICY CHECKS:                                                |
  - Tool in registry?                                           |
  - Tool allowed by this skill version?                         |
  - Execution still RUNNING (not cancelled)?                    |
  - currentStep < maxSteps?                                     |
        |                                                        |
  requiresApproval?                                             |
  YES -> Create Approval (PENDING)                              |
         Set execution WAITING_APPROVAL                         |
         Frontend shows approval UI                             |
         Human APPROVE/REJECT                                   |
         APPROVE -> idempotency check -> execute once           |
         REJECT  -> do not execute, resume/fail                 |
        |                                                        |
  NO  -> Execute tool directly                                  |
         On failure -> retry (<=3) -> else FAILED               |
        |                                                        |
Store step result -----------------------------------------------+
```

---

## Tool Architecture

All tools are registered in a central **Tool Registry** (`backend/src/tools/registry.js`). Each tool has:
- `name`, `description`, `inputSchema`, `outputSchema`
- `readWrite`: `"read"` or `"write"`
- `requiresApproval`: boolean
- `execute(args)`: the actual implementation

Every tool call from Gemini is routed through the registry. The backend verifies tool existence, skill permission, and approval status before any execution. The LLM cannot request a tool that isn't in the registry, and cannot call a tool not permitted by the skill.

---

## Database Design

| Collection | Purpose |
|-----------|---------|
| `skills` | Parent skill entity - name, purpose, status, current version |
| `skill_versions` | Immutable snapshots - schemas, instructions, tools config, maxSteps |
| `executions` | Full execution record with step-by-step trace |
| `approvals` | Approval requests for write actions; idempotency key stored here |
| `created_tasks` | Persisted tasks from `mock_task_creator` tool |

---

## Human Approval Design

When an agent requests a write-capable tool that is listed in `approvalRequiredActions`:
1. An `Approval` record is created with status `PENDING`
2. The execution pauses (`WAITING_APPROVAL`)
3. The frontend polls and displays the approval UI
4. The human clicks **Approve** or **Reject**
5. If **Approved**: the write action executes exactly once (idempotency enforced)
6. If **Rejected**: the action is not executed; the agent is informed and may produce a final answer

The LLM has no way to bypass this - approval is enforced by the backend policy layer.

---

## Versioning

- Creating a skill always creates `version 1` as a `draft`
- Publishing a draft makes it immutable (status=`published`)
- Editing a published skill creates a **new draft** version; the original is never modified
- Executions always record the `skillVersionId` used - re-running a historical version uses its exact configuration

---

## Idempotency / Duplicate Write Prevention

Each approval record stores a unique `idempotencyKey = "${executionId}_${stepIndex}"`.

Before executing a write action after approval:
1. Check `approval.executedAt` - if set, the action already ran; return the stored `approval.result`
2. If not set, execute the write, then atomically set `approval.executedAt` and `approval.result`

This prevents duplicate task creation from double-clicks, frontend retries, or network issues.

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm 9+
- MongoDB Atlas account (or local MongoDB)
- Google Gemini API key

### Environment Variables

Copy `.env.example` to `backend/.env` and fill in your values:

```bash
cp .env.example backend/.env
```

### Local Development

```bash
# Install and run backend
cd backend
npm install
npm run dev

# In another terminal - install and run frontend
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:5000`
Frontend runs on `http://localhost:5173`

### Seed Demo Skill

```bash
cd backend
npm run seed
```

This creates the **Customer Issue Resolver** demo skill.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Full MongoDB connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GEMINI_MODEL` | No | Gemini model ID (default: `gemini-1.5-flash`) |
| `PORT` | No | Backend port (default: 5000) |
| `FRONTEND_URL` | No | Frontend origin for CORS |
| `NODE_ENV` | No | `development` or `production` |

---

## Deployment

| Layer | Target | Config |
|-------|--------|--------|
| Frontend | Vercel | Connect GitHub repo, set `VITE_API_URL` env var |
| Backend | Render | Web service, set all backend env vars |
| Database | MongoDB Atlas | Set `MONGODB_URI` with Atlas connection string |

---

## Testing

```bash
cd backend
npm test
```

Tests cover:
- Tool authorization (unknown/unauthorized tools rejected)
- Skill validation (invalid skill cannot publish)
- Approval flow (write only executes after approval)
- Idempotency (duplicate approval returns stored result)
- Retry logic (retryable failures retry <=3 times)
- Max steps enforcement
- Cancellation
- Execution history persistence

---

## Completed Scope

- User-defined skills with JSON Schema input/output
- Draft to Published versioning (immutable published versions)
- 4 bounded tools (calculator, document_search, record_lookup, mock_task_creator)
- Real Gemini-powered agent loop with structured output
- Backend policy enforcement (tool auth, max steps, cancellation)
- Human-in-the-loop approval for write actions
- Idempotent write execution
- Retry on retryable tool failures (max 3 attempts)
- Cancellation at any step
- Full execution step trace persisted to MongoDB
- Approval history persisted
- Version comparison
- Historical version re-run
- Customer Issue Resolver demo skill (seeded)
- All loading/empty/validation/success/failure states in frontend
- Deployment targets configured (Vercel + Render + Atlas)

## Intentionally Excluded Scope

- Authentication / user accounts (single-user MVP)
- WebSockets (polling used instead - simpler, sufficient)
- Vector database / semantic search (keyword search sufficient for 4 documents)
- Multi-agent architecture
- External task management integrations (e.g. Jira, Linear)
- Complex RBAC

## Known Limitations

- Execution polling interval is 2 seconds; there is a brief UI lag between agent steps
- Document search is keyword-based; not suitable for large knowledge bases
- No real user authentication; `createdBy` defaults to `"system"`
- The Gemini response parser falls back to a retry if the model produces non-JSON output (up to 2 retries)

---

## Requirement Matrix

| Requirement | Implementation | Verified |
|------------|----------------|---------|
| User-defined skills | Skill + SkillVersion models, skill editor UI | ✓ |
| Input schema | JSON Schema field on SkillVersion | ✓ |
| Output schema | JSON Schema field on SkillVersion | ✓ |
| Allowed tools | allowedTools[] on SkillVersion, enforced by policyChecker | ✓ |
| Approval actions | approvalRequiredActions[], enforced by approvalManager | ✓ |
| Maximum steps | maxSteps on SkillVersion, enforced in agent loop | ✓ |
| Draft versions | status=draft on SkillVersion | ✓ |
| Published versions | status=published, immutable | ✓ |
| Skill testing | Skill Tester page, version selector, input form | ✓ |
| Tool restrictions | Central registry + policyChecker pre-execution | ✓ |
| Execution plan | Execution viewer shows all steps including LLM decisions | ✓ |
| Tool calls/results | Each step records input, output, status | ✓ |
| Human approval | Approval model, ApprovalPanel UI, pause/resume flow | ✓ |
| Duplicate prevention | idempotencyKey + executedAt check on Approval | ✓ |
| Tool failure | Error recorded in step, execution may fail | ✓ |
| Retry | Up to 3 retries for retryable failures, recorded in steps | ✓ |
| Cancellation | POST /executions/:id/cancel, checked before each step | ✓ |
| Execution history | executions collection, Execution Viewer page | ✓ |
| Approval history | approvals collection, shown in Execution Viewer | ✓ |
| Version history | Version History page per skill | ✓ |
| Version comparison | GET /skills/:id/versions/compare + compare UI | ✓ |
| Historical rerun | Execute with specific versionNumber payload | ✓ |
| Deployment | Vercel + Render + Atlas config documented | ✓ |
