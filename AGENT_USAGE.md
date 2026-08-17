# AGENT_USAGE.md — Coding Agent Usage Log

This file documents how AI coding agents were used throughout the development of the Dynamic User-Defined Skills Agent Platform.

---

## Coding Agents / Tools Used

- **Antigravity** (Google DeepMind) — primary coding agent used throughout the project via the IDE integration

---

## Representative Prompts Used

### Architecture and Planning

```
Analyze the complete requirements. Inspect the current workspace. Propose the final project architecture, folder structure, MongoDB schemas, API design, agent state machine, and implementation phases. Create README.md, AGENT_USAGE.md, INTERVIEW_PREP.md, PROGRESS.md, and .env.example. STOP and present the plan before beginning major implementation.
```

### Backend Scaffold

```
Phase 1 - Project Setup. Initialize the backend with Node.js/Express, connect to MongoDB Atlas, set up CORS, environment config, and health endpoint. Initialize the frontend with React/Vite/Tailwind. Confirm communication between frontend and backend.
```

### Tool Registry

```
Phase 4 - Implement the Tool Registry with all 4 bounded tools: calculator, document_search, record_lookup, mock_task_creator. Include input validation, read/write classification, and approval metadata.
```

### Agent Engine

```
Phase 5 - Build the Agent Engine orchestration loop. Integrate Gemini with structured output. Implement policy checks before every tool call. Build the complete state machine from input validation through final output.
```

### Approval Flow

```
Phase 6 - Implement the human approval system. Create Approval model, pause/resume execution, idempotency key enforcement, and the frontend ApprovalPanel component.
```

---

## Work Delegated to Agent

| Category | Delegated To Agent |
|----------|-------------------|
| Project scaffolding (both apps) | Antigravity |
| MongoDB schema design | Antigravity (reviewed and approved by developer) |
| Express route structure | Antigravity (reviewed) |
| Tool registry pattern | Antigravity (reviewed) |
| Agent engine state machine | Antigravity (designed collaboratively) |
| Gemini client wrapper | Antigravity (reviewed for security) |
| Frontend component structure | Antigravity (reviewed) |
| Knowledge base documents | Antigravity (developer wrote final content) |
| Mock data records | Antigravity |
| Test scaffolding | Antigravity (developer verified test logic) |
| Documentation drafts | Antigravity (developer reviewed and edited) |
| README.md | Antigravity (developer verified accuracy) |

---

## Important Agent Mistakes

### Mistake 1 — Proposed Arbitrary Tool Execution
**Date**: During Phase 5 planning
**What happened**: Agent initially suggested allowing the LLM to call arbitrary tools by passing the tool name and arguments directly from the Gemini response to a dynamic `require()` call.
**Why rejected**: This violates the bounded-tool architecture. The LLM must not be able to execute arbitrary application code. All tool calls must go through the central registry with explicit validation.
**Resolution**: Implemented a strict registry lookup where unknown tool names return a structured error that is fed back to the LLM (not executed).

### Mistake 2 — Proposed eval() for Calculator
**What happened**: Agent initially suggested using JavaScript `eval()` to evaluate calculator expressions.
**Why rejected**: `eval()` allows arbitrary code execution. Even with sandboxing, it is unnecessary for a bounded calculator tool.
**Resolution**: Used `mathjs` library's `evaluate()` function which operates on a safe mathematical expression parser.

### Mistake 3 — Suggested Storing Full Conversation History in Gemini Context
**What happened**: Agent proposed sending the full MongoDB execution document (with all steps) back to Gemini on every iteration.
**Why rejected**: This would leak internal execution state details to the LLM and could cause context overflow. The LLM should only see what it needs: the tool result from the last step.
**Resolution**: Only the previous tool result and a summarized conversation history is passed to Gemini on each iteration.

### Mistake 4 — Legacy Gemini SDK & Hardcoded Deprecated Model Names
**What happened**: Agent initially used the legacy `@google/generative-ai` package and hardcoded deprecated model names (`gemini-1.5-flash`, `gemini-2.0-flash`).
**Why rejected**: Google AI Studio `AQ.` API keys require the updated `@google/genai` SDK, and deprecated models return 404 NOT_FOUND errors.
**Resolution**: Migrated backend to `@google/genai` and implemented dynamic model discovery that auto-detects active models (e.g. `gemini-3.6-flash`).

### Mistake 5 — In-Memory Idempotency vs Atomic Concurrency Locking
**What happened**: Agent initially checked `if (approval.executedAt)` on an in-memory document fetched before execution, which allowed two simultaneous HTTP approval requests to both execute `tool.execute()`.
**Why rejected**: In a multi-tenant or concurrent environment, two simultaneous requests could bypass the in-memory check and create duplicate tasks in MongoDB.
**Resolution**: Implemented atomic database-level claim (`findOneAndUpdate` with `{ executedAt: { $exists: false }, executing: { $ne: true } }`) so only one concurrent request acquires the execution lock. Verified via `Promise.all` test in `approvals.test.js`.

### Mistake 6 — Exposing Raw JSON Schema Textareas to Non-Technical Evaluators
**What happened**: Agent initially provided raw JSON textareas (`JSON.stringify({}, null, 2)`) in the Skill Editor and Skill Tester UI.
**Why rejected**: Requiring evaluators to write raw JSON Schema introduces UX friction and formatting syntax errors.
**Resolution**: Built a visual form-based Field Builder (*Field Name, Description, Type, Required*) in the frontend with authoritative backend schema normalization in `schemaBuilder.js`. Generated JSON Schema is stored canonically in `SkillVersion` and inspectable via a read-only collapsible viewer.

---

## Rejected Suggestions

| Suggestion | Reason Rejected |
|-----------|----------------|
| Use WebSockets for real-time execution updates | Polling is simpler, sufficient, and avoids Render WebSocket complexity |
| Use a vector database (Pinecone/Weaviate) for document search | 4 documents; keyword scoring is sufficient and avoids unnecessary dependencies |
| Use LangChain as the agent framework | We need explicit control over every policy check; LangChain abstracts away the security-critical parts |
| Store Gemini API key in frontend environment | Security violation; all Gemini calls must happen server-side |
| Allow the LLM to specify retry count | Max steps and retry limits are backend-enforced; LLM cannot override them |
| Use JWT authentication | Out of scope for MVP; adds complexity without evaluation benefit |
| Multi-agent architecture | Not required; adds complexity without demonstrating additional required features |

---

## Verification Methods

| Code Area | Verification Method |
|-----------|-------------------|
| Tool registry authorization | Unit tests (Jest) — unknown tool rejected, unauthorized tool rejected |
| Skill validation | Unit tests — invalid schema fails publish, valid schema succeeds |
| Agent loop policy checks | Integration tests — max steps enforced, cancellation stops loop |
| Approval idempotency | Integration test — double-approve returns stored result, no duplicate task |
| Approval rejection | Integration test — write does not execute after reject |
| Retry logic | Unit test — retryable errors retry <=3 times |
| Gemini client | Manual review — structured output parsing, fallback on malformed response |
| Database schema | Manual review of Mongoose models against design document |
| CORS and environment config | Manual test — frontend connects to backend in both dev and prod modes |
| End-to-end demo flow | Manual walkthrough — Customer Issue Resolver from input to final output |
