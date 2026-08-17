# Dynamic User-Defined Skills Agent Platform

A web application that lets non-technical evaluators create and run reusable **AI-powered "skills"** — constrained agent workflows powered by Google Gemini, with human-in-the-loop approval, full execution tracing, versioned skill management, and a non-technical schema builder.

---

## Product Overview

A **Skill** is a user-defined configuration that tells an AI agent:
- What its purpose is
- What information it receives (visual field builder → canonical JSON Schema)
- What information it returns (visual expected output builder → canonical JSON Schema)
- Which tools it is allowed to use
- Which of those tools require human approval before execution
- How many steps the agent can take before being stopped

Users create skills, publish versioned snapshots, then run them against real input. The backend enforces every constraint — the LLM provides intelligence, the backend provides control.

---

## Architecture

```
FRONTEND (React + Vite + Tailwind)
        |  REST API (axios polling)
        |  - Form-based Schema Builder (UX Abstraction)
        |  - Dynamic Input Form Generator
        v
BACKEND (Node.js + Express)
        |  - Canonical Schema Builder (schemaBuilder.js)
        |  - Authoritative Validation & Normalization
        v
AGENT ENGINE (Orchestration Loop — 100% Generic)
        |
        +- POLICY CHECKER (auth, per-skill allowedTools, maxSteps, cancel)
        +- APPROVAL MANAGER (create/resume approval flows + idempotency)
        +- GEMINI CLIENT (structured LLM calls + system prompt)
        |
        +- TOOL REGISTRY (4 bounded tools)
        |       +- calculator
        |       +- document_search  [Bounded Knowledge Base Search]
        |       +- record_lookup
        |       +- mock_task_creator [WRITE - requires human approval]
        |
        +- MONGOOSE ODM
                v
        MONGODB ATLAS
        +- skills
        +- skill_versions
        +- executions
        +- approvals
        +- created_tasks
```

---

## Non-Technical Schema Builder & Authoritative Backend Contract

To ensure evaluators never have to manually author JSON Schema, the platform provides a friendly form builder:
- **Input Fields**: Evaluators add fields with *Field Name, Description, Type* (`Text`, `Long text`, `Number`, `Boolean`, `Date`), and a *Required* toggle.
- **Expected Output Fields**: Evaluators define the expected return fields.
- **Authoritative Backend Normalization**: The frontend sends field definitions or schemas. The backend schema builder (`backend/src/validators/schemaBuilder.js`) deterministically converts field definitions into canonical JSON Schema objects stored in `SkillVersion`.
- **Read-Only Inspection**: For debugging, a collapsible *"View generated schema"* section displays the canonical JSON Schema without allowing raw editing.

---

## Knowledge Base & Document Search Architecture

`document_search` is a **bounded shared tool** centrally registered in the Tool Registry:
1. **Source**: Knowledge base documents are stored as static Markdown files in `backend/src/knowledge/` (`refund_policy.md`, `billing_policy.md`, `support_guidelines.md`, `escalation_rules.md`).
2. **Access Control**: A skill can only use `document_search` if `document_search` is explicitly included in that skill's `allowedTools` list.
3. **Retrieval**: When requested, `document_search` performs keyword frequency scoring over knowledge base documents and returns relevant excerpts to the agent.
4. **No Document Found**: Returns `results: []` with an explicit message so the LLM can state that no matching policy was found.
5. **Tool Isolation**: Multiple skills (e.g. *Customer Issue Resolver* and *Internal Policy Assistant*) share the same central `document_search` tool without custom skill-specific implementations.

---

## Agent Workflow & Execution Pipeline

```
User submits form input
        |
Validate input against skill's canonical inputSchema
        |
Create Execution record (status=RUNNING)
        |
Call Gemini with instructions + allowed tool definitions <-------+
        |                                                        |
Parse structured JSON response                                   |
        |                                                        |
   type=final ---------------------------------> Store output, COMPLETE
        |                                                        |
   type=tool_call                                               |
        |                                                        |
   POLICY CHECKS:                                                |
   - Tool registered in Tool Registry?                           |
   - Tool in skill's allowedTools list?                         |
   - Execution status RUNNING (not cancelled)?                   |
   - currentStep < maxSteps?                                     |
        |                                                        |
   requiresApproval?                                             |
   YES -> Create Approval (PENDING)                              |
          Set execution WAITING_APPROVAL                         |
          Frontend displays proposed action UI                   |
          Human APPROVE / REJECT                                 |
          APPROVE -> idempotency check -> execute once           |
          REJECT  -> do not execute, return rejection to LLM    |
        |                                                        |
   NO  -> Execute tool directly                                  |
          On retryable failure -> retry (<=3) -> else FAILED     |
        |                                                        |
Store step result -----------------------------------------------+
```

---

## Complete 12-Step Skill Lifecycle

1. **Create Draft**: User provides Name, Purpose, Instructions, Input fields, Output fields, Allowed tools, Approval policy, and Max steps.
2. **Configure Knowledge/Tools**: User selects bounded tools (`document_search`, `calculator`, `record_lookup`, `mock_task_creator`).
3. **Schema Generation**: `schemaBuilder.js` deterministically generates canonical `inputSchema` and `outputSchema`.
4. **Validation**: `validateSkillForPublish` verifies metadata, instructions length, tool existence, write action approval rules, and step limits.
5. **Save Draft**: Draft version saved to MongoDB. Editable at any time.
6. **Publish**: Creates an immutable `SkillVersion` (status=`published`).
7. **Test Skill**: User enters input via dynamic form controls derived from `inputSchema`.
8. **Agent Execution**: Agent engine processes request dynamically from `SkillVersion`.
9. **Knowledge Retrieval**: If requested and authorized, `document_search` queries the knowledge base.
10. **Tool Execution**: Policy Checker validates requested tool call before execution.
11. **Human Approval**: Pauses for human review if write action requires approval. Approved write actions execute idempotently.
12. **Completion**: Stores final result and full step execution history.

---

## Multi-Skill & Generic Execution Demonstration

The platform contains **zero hardcoded skill name checks** (`if skillName === ...`). The same agent engine executes all skills dynamically:
- **Customer Issue Resolver** (Seeded): Uses `record_lookup`, `document_search`, and `mock_task_creator` (requires approval).
- **Internal Policy Assistant** (Seeded): Uses `document_search` only (no write tools, no approval needed). Input requires only a single `question` field.
- **Calculator Assistant** (Dynamic): Created via UI/API with `calculator` tool only. Proves 100% dynamic execution without backend code modifications.

---

## Database Design

| Collection | Purpose |
|-----------|---------|
| `skills` | Parent skill entity - name, purpose, status, current version |
| `skill_versions` | Immutable snapshots - canonical schemas, instructions, allowedTools, approvalRequiredActions, maxSteps |
| `executions` | Full execution record with step-by-step trace |
| `approvals` | Approval requests for write actions; idempotencyKey stored here |
| `created_tasks` | Persisted tasks from `mock_task_creator` write tool |

---

## Testing

```bash
cd backend
npm test
```

Test suites cover:
- **`schemaBuilder.test.js`**: String, number, boolean, date, required/optional fields, duplicate/invalid field validation, schema parsing, and equivalence tests.
- **`policyChecker.test.js`**: Tool authorization, per-skill tool isolation security tests (proving Skill B cannot call Skill A's write tools), step limit enforcement, and approval checks.
- **`skillValidator.test.js`**: Draft validation rules prior to publishing.
- **`agentEngine.test.js`**: Generic multi-skill execution, dynamic new skill creation without code changes, basic loop, maximum steps, cancellation, and write approval boundaries.
- **`approvals.test.js`**: Human approval resume flow, database-level idempotency key enforcement, duplicate approval protection, and rejection handling.
- **`tools.test.js`**: Unit tests for calculator, document_search, and record_lookup.

---

## Completed Scope

- Form-based schema builder UX abstraction with authoritative backend schema normalization.
- Dynamic input form generation for testing skills.
- Multi-skill generic agent loop supporting diverse tool configurations.
- Two seeded demo skills (*Customer Issue Resolver* & *Internal Policy Assistant*).
- Dynamic creation of custom skills without backend code changes.
- Bounded document search over static knowledge base.
- Human-in-the-loop approval system with database-level idempotency key protection.
- Immutable published version enforcement and execution tracing.

---

## Known Limitations

- Static knowledge base: Knowledge base documents are static Markdown files stored in `backend/src/knowledge/`.
- Polling mechanism: Frontend uses polling to track execution progress and pending approvals.
