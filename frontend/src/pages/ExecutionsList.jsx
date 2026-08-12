import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ChevronRight, Play } from 'lucide-react'
import { getExecutions } from '../api/client'
import StatusBadge from '../components/common/StatusBadge'
import { FullPageLoader } from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'

export default function ExecutionsList() {
  const [executions, setExecutions] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => {
    getExecutions({ limit: 50 })
      .then(data => setExecutions(data.executions || []))
      .catch(err  => setError(err.response?.data?.error || err.message))
      .finally(()  => setLoading(false))
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      {/* Header */}
      <header className="animate-fade-in-up">
        <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
          <Activity className="w-3.5 h-3.5" />
          Agent Runs
        </div>
        <h1 className="text-3xl font-display font-bold tracking-tight text-gradient">
          Execution History
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">All past and current agent executions.</p>
      </header>

      {loading && <FullPageLoader text="Fetching executions..." />}

      {error && (
        <div className="card p-4 border-red-800/40 bg-red-950/20 text-red-300 text-sm animate-fade-in">
          {error}
        </div>
      )}

      {!loading && !error && executions.length === 0 && (
        <div className="card animate-fade-in">
          <EmptyState
            icon={<Play className="w-5 h-5 text-muted-foreground" />}
            title="No executions yet"
            description="Run a published skill to see your execution history here."
            action={
              <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-foreground/5 text-foreground text-xs font-medium hover:bg-foreground/10 transition-colors">
                Go to Dashboard
              </Link>
            }
          />
        </div>
      )}

      {!loading && !error && executions.length > 0 && (
        <div className="card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="px-6 py-4 border-b border-glass">
            <p className="text-xs text-muted-foreground">{executions.length} execution{executions.length !== 1 ? 's' : ''} total</p>
          </div>
          <div className="divide-y divide-glass/40">
            {executions.map((ex, idx) => {
              const isActive = ex.status === 'RUNNING' || ex.status === 'WAITING_APPROVAL'
              return (
                <Link
                  key={ex._id}
                  to={`/executions/${ex._id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors group animate-slide-in-row"
                  style={{ animationDelay: `${idx * 0.02}s` }}
                >
                  {/* Status indicator */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-mono text-foreground">
                          {ex._id.substring(0, 8)}…
                        </span>
                        <span className="text-muted-foreground/30 text-xs">·</span>
                        <span className="text-[10px] font-mono text-muted-foreground">v{ex.versionNumber}</span>
                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] text-blue-400 ml-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Live
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {JSON.stringify(ex.input).substring(0, 90)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {new Date(ex.startedAt).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono">
                        {new Date(ex.startedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <StatusBadge status={ex.status} />
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
