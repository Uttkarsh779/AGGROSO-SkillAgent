import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Brain, Wrench, User, CheckCircle, XCircle,
  AlertTriangle, Clock, ChevronDown, ChevronUp, Shield
} from 'lucide-react'
import { getExecution, cancelExecution, getExecutionApprovals, approveAction, rejectAction } from '../api/client'
import StatusBadge from '../components/common/StatusBadge'
import { FullPageLoader, InlineSpinner } from '../components/common/LoadingSpinner'

const POLL_INTERVAL = 2000

const STEP_CONFIG = {
  llm_decision:     { icon: Brain,       label: 'LLM Decision',  accent: '#52525b', rowClass: 'info'    },
  tool_call:        { icon: Wrench,      label: 'Tool Call',     accent: '#3f3f46', rowClass: 'command' },
  approval_request: { icon: User,        label: 'Approval Gate', accent: '#d97706', rowClass: 'warning' },
  final:            { icon: CheckCircle, label: 'Final',         accent: '#10b981', rowClass: 'success' },
  error:            { icon: XCircle,     label: 'Error',         accent: '#ef4444', rowClass: 'error'   },
}

// Tiny inline status dot — replaces the large StatusBadge in trace rows
const STATUS_DOT = {
  success:          { dot: '#10b981', text: 'OK'       },
  failed:           { dot: '#ef4444', text: 'Failed'   },
  retrying:         { dot: '#f59e0b', text: 'Retrying' },
  pending:          { dot: '#f59e0b', text: 'Pending'  },
  skipped:          { dot: '#52525b', text: 'Skipped'  },
}

function StepStatusDot({ status }) {
  const cfg = STATUS_DOT[status]
  if (!cfg) return null
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.dot }} />
      <span className="text-[9px] font-mono font-semibold" style={{ color: cfg.dot }}>{cfg.text}</span>
    </span>
  )
}

/* ── Single step row in the terminal trace ── */
function StepRow({ step }) {
  const [expanded, setExpanded] = useState(false)
  const cfg    = STEP_CONFIG[step.type] || { icon: Clock, label: step.type, accent: '#52525b', rowClass: 'info' }
  const Icon   = cfg.icon
  const isFail = step.status === 'failed'
  const isRetry= step.status === 'retrying'
  const rowCls = isFail ? 'error' : isRetry ? 'warning' : cfg.rowClass

  return (
    <div
      className={`terminal-row ${rowCls} cursor-pointer`}
      style={{ padding: '9px 12px 9px 10px' }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* ── Collapsed: single tight line ── */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Step type icon */}
        <Icon className="w-3 h-3 shrink-0" style={{ color: isFail ? '#ef4444' : isRetry ? '#f59e0b' : cfg.accent }} />

        {/* Type label */}
        <span className="text-[11px] font-medium text-foreground/80 shrink-0 leading-none">{cfg.label}</span>

        {/* Tool chip — only on tool calls */}
        {step.tool && (
          <span className="px-1 py-0.5 rounded text-[9px] font-mono text-zinc-400 bg-zinc-800/60 border border-zinc-700/50 shrink-0 leading-none">
            {step.tool}
          </span>
        )}

        {/* Status dot */}
        <StepStatusDot status={step.status} />

        {/* Retry indicator */}
        {step.retryCount > 0 && (
          <span className="text-[9px] font-mono text-amber-500 shrink-0">×{step.retryCount}</span>
        )}

        {/* Separator + reason — takes remaining space, truncates */}
        {step.reason && (
          <>
            <span className="text-zinc-700 shrink-0 text-[10px]">—</span>
            <span className="text-[10px] text-zinc-500 truncate leading-none min-w-0">{step.reason}</span>
          </>
        )}

        {/* Error inline */}
        {step.error && !step.reason && (
          <>
            <span className="text-zinc-700 shrink-0 text-[10px]">—</span>
            <span className="text-[10px] text-red-400 truncate font-mono leading-none min-w-0">{step.error}</span>
          </>
        )}

        {/* Step number — pinned right */}
        <span className="ml-auto text-[9px] font-mono text-zinc-700 shrink-0 pl-2">#{step.step}</span>

        {/* Expand chevron */}
        <span className="text-zinc-700 shrink-0">
          {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </span>
      </div>

      {/* ── Expanded detail (reason full + input/output) ── */}
      {expanded && (
        <div className="mt-2.5 ml-5 space-y-2 animate-fade-in border-l border-white/[0.06] pl-3">
          {/* Full reason if truncated */}
          {step.reason && (
            <p className="text-[10px] text-zinc-400 leading-relaxed">{step.reason}</p>
          )}
          {step.error && (
            <p className="text-[10px] text-red-400 font-mono leading-relaxed">{step.error}</p>
          )}

          {step.input && Object.keys(step.input).length > 0 && step.type !== 'llm_decision' && (
            <div>
              <p className="text-[8px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-1">Input</p>
              <pre className="code-block text-[10px] max-h-32 overflow-auto leading-relaxed">
                {JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}
          {step.output && (
            <div>
              <p className="text-[8px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-1">Output</p>
              <pre className="code-block text-[10px] max-h-32 overflow-auto leading-relaxed">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}



/* ── Compact meta row for right sidebar ── */
function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="text-[11px] text-foreground font-mono">{value}</div>
    </div>
  )
}

/* ── Approval card on the right panel ── */
function ApprovalCard({ approval, onApprove, onReject, loading }) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="rounded-xl border border-amber-700/30 bg-amber-950/10 overflow-hidden animate-scale-in">
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-amber-700/20 bg-amber-950/20">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-300">Approval Required</span>
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3.5">
        {/* Tool */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-1">Tool</p>
          <code className="text-sm font-mono text-foreground">{approval.tool}</code>
        </div>

        {/* Reason */}
        {approval.reason && (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-1">Reason</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{approval.reason}</p>
          </div>
        )}

        {/* Payload */}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-1">Payload</p>
          <pre className="code-block text-[10px] max-h-40 overflow-auto leading-relaxed">
            {JSON.stringify(approval.payload, null, 2)}
          </pre>
        </div>

        {/* Actions */}
        {!confirmed ? (
          <div className="flex gap-2 pt-1">
            <button
              id={`btn-approve-${approval._id}`}
              onClick={() => setConfirmed(true)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] text-white text-xs font-semibold transition-all disabled:opacity-40"
            >
              ✓ Approve
            </button>
            <button
              id={`btn-reject-${approval._id}`}
              onClick={onReject}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-700/80 hover:bg-red-700 active:scale-[0.98] text-white text-xs font-semibold transition-all disabled:opacity-40"
            >
              ✗ Reject
            </button>
          </div>
        ) : (
          <div className="space-y-2 animate-fade-in">
            <p className="text-[11px] text-amber-300 font-medium">Confirm this write action?</p>
            <div className="flex gap-2">
              <button
                id={`btn-confirm-approve-${approval._id}`}
                onClick={onApprove}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-all disabled:opacity-40"
              >
                {loading ? <><InlineSpinner size={12} /> Executing…</> : '✓ Confirm & Execute'}
              </button>
              <button
                onClick={() => setConfirmed(false)}
                className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function ExecutionDetail() {
  const { id }   = useParams()
  const [execution,   setExecution]   = useState(null)
  const [approvals,   setApprovals]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [cancelling,  setCancelling]  = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const intervalRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const [execData, approvalData] = await Promise.all([
        getExecution(id),
        getExecutionApprovals(id),
      ])
      setExecution(execData.execution)
      setApprovals(approvalData.approvals || [])
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!execution) return
    if (['RUNNING', 'WAITING_APPROVAL'].includes(execution.status)) {
      intervalRef.current = setInterval(fetchData, POLL_INTERVAL)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [execution?.status, fetchData])

  async function handleCancel() {
    setCancelling(true)
    try { await cancelExecution(id); await fetchData() }
    catch (err) { setError(err.response?.data?.error || err.message) }
    finally { setCancelling(false) }
  }

  async function handleApprove(approvalId) {
    setApprovingId(approvalId)
    try { await approveAction(approvalId); await fetchData() }
    catch (err) { setError(err.response?.data?.error || err.message) }
    finally { setApprovingId(null) }
  }

  async function handleReject(approvalId) {
    setApprovingId(approvalId)
    try { await rejectAction(approvalId); await fetchData() }
    catch (err) { setError(err.response?.data?.error || err.message) }
    finally { setApprovingId(null) }
  }

  if (loading) return <FullPageLoader text="Loading execution…" />

  if (!execution) return (
    <div className="p-8">
      <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-red-300 text-sm">
        {error || 'Execution not found'}
      </div>
    </div>
  )

  const isActive = ['RUNNING', 'WAITING_APPROVAL'].includes(execution.status)
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING')
  const duration = execution.completedAt
    ? `${Math.round((new Date(execution.completedAt) - new Date(execution.startedAt)) / 1000)}s`
    : null

  return (
    <div className="flex flex-col h-full min-h-screen">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-20 glass-panel-heavy border-b border-glass px-6 py-3 flex items-center justify-between gap-4">
        {/* Breadcrumb + status */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/executions"
            className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Executions
          </Link>
          <span className="text-muted-foreground/30 text-xs">/</span>
          <span className="text-[11px] font-mono text-foreground/60 truncate">{id.substring(0, 12)}…</span>
          <StatusBadge status={execution.status} />
          {isActive && (
            <span className="flex items-center gap-1.5 text-[11px] text-blue-400 font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <button
              id="btn-cancel"
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all disabled:opacity-40"
            >
              {cancelling ? <InlineSpinner size={12} /> : '✕'} Cancel
            </button>
          )}
          <Link
            to="/executions"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_340px] divide-x divide-glass">

        {/* LEFT: main trace */}
        <div className="overflow-y-auto p-6 space-y-5">

          {/* Page title */}
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-gradient">Execution</h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-1">
              v{execution.versionNumber}
              {' · '}Step {execution.currentStep}
              {' · '}Started {new Date(execution.startedAt).toLocaleTimeString()}
              {duration && ` · ${duration}`}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 text-red-300 text-xs animate-fade-in">
              {error}
            </div>
          )}

          {/* Input block */}
          <section>
            <p className="section-title mb-2">Input</p>
            <div className="code-block">
              <pre className="text-[11px] overflow-auto max-h-32 leading-relaxed">
                {JSON.stringify(execution.input, null, 2)}
              </pre>
            </div>
          </section>

          {/* Execution trace */}
          <section>
            <p className="section-title mb-2">Execution Trace</p>
            <div className="terminal-console divide-y divide-white/[0.04]">
              {(!execution.steps || execution.steps.length === 0) && (
                <div className="terminal-row info py-4 text-[11px] text-muted-foreground">
                  No steps recorded yet…
                </div>
              )}
              {execution.steps?.map((step, idx) => (
                <StepRow key={idx} step={step} />
              ))}

              {/* Live indicators */}
              {execution.status === 'RUNNING' && (
                <div className="terminal-row info py-3 flex items-center gap-2.5">
                  <InlineSpinner size={12} />
                  <span className="text-[11px] text-blue-300">Agent is thinking…</span>
                </div>
              )}
              {execution.status === 'WAITING_APPROVAL' && (
                <div className="terminal-row warning py-3 flex items-center gap-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-amber-300">Paused — awaiting human approval</span>
                </div>
              )}
            </div>
          </section>

          {/* Final output */}
          {execution.status === 'COMPLETED' && execution.finalOutput && (
            <section className="animate-scale-in">
              <p className="section-title mb-2">Final Output</p>
              <div className="rounded-xl border border-emerald-800/25 bg-emerald-950/10 px-4 py-4">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {execution.finalOutput}
                </p>
              </div>
            </section>
          )}

          {/* Failure */}
          {execution.status === 'FAILED' && execution.error && (
            <section className="animate-fade-in">
              <p className="section-title mb-2">Error</p>
              <div className="rounded-xl border border-red-800/30 bg-red-950/10 px-4 py-3">
                <p className="text-sm text-red-300 font-mono leading-relaxed">{execution.error}</p>
              </div>
            </section>
          )}

          {/* Cancelled */}
          {execution.status === 'CANCELLED' && (
            <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground animate-fade-in">
              ⊘ Execution cancelled by user
            </div>
          )}
        </div>

        {/* RIGHT: sidebar panel */}
        <div className="overflow-y-auto p-5 space-y-5 bg-[#0b0b0d]">

          {/* Pending approvals */}
          {pendingApprovals.length > 0 && (
            <section>
              <p className="section-title mb-2.5">⚠ Approval Required</p>
              <div className="space-y-3">
                {pendingApprovals.map(approval => (
                  <ApprovalCard
                    key={approval._id}
                    approval={approval}
                    onApprove={() => handleApprove(approval._id)}
                    onReject={() => handleReject(approval._id)}
                    loading={approvingId === approval._id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Approval history */}
          {approvals.length > 0 && (
            <section>
              <p className="section-title mb-2.5">Approval History</p>
              <div className="space-y-2">
                {approvals.map(a => (
                  <div key={a._id} className="rounded-lg border border-border bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <code className="text-[11px] font-mono text-foreground">{a.tool}</code>
                      <StatusBadge status={a.status} />
                    </div>
                    {a.reason && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{a.reason}</p>
                    )}
                    {a.decidedAt && (
                      <p className="text-[10px] text-muted-foreground/40 font-mono mt-1.5">
                        {new Date(a.decidedAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Metadata */}
          <section>
            <div className="flex items-center gap-2 mb-2.5">
              <Shield className="w-3 h-3 text-muted-foreground/60" />
              <p className="section-title">Metadata</p>
            </div>
            <div className="rounded-lg border border-border bg-white/[0.02] px-3 divide-y divide-white/[0.05]">
              <MetaRow label="Status"    value={<StatusBadge status={execution.status} />} />
              <MetaRow label="Version"   value={`v${execution.versionNumber}`} />
              <MetaRow label="Steps"     value={execution.currentStep} />
              <MetaRow label="Started"   value={new Date(execution.startedAt).toLocaleTimeString()} />
              {execution.completedAt && (
                <MetaRow label="Completed" value={new Date(execution.completedAt).toLocaleTimeString()} />
              )}
              {duration && <MetaRow label="Duration" value={duration} />}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
