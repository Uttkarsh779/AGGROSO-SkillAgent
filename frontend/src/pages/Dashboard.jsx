import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Layers, Play, ChevronRight, Plus, Zap, RefreshCw } from 'lucide-react'
import { getSkills, getExecutions } from '../api/client'
import StatusBadge from '../components/common/StatusBadge'
import EmptyState from '../components/common/EmptyState'

function StatTile({ label, value, subtitle, icon, accentColor, delay = 0 }) {
  return (
    <div
      className="card card-hover-glow p-5 animate-fade-in-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-display font-bold text-foreground leading-none">{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
          style={{ backgroundColor: `${accentColor}14`, border: `1px solid ${accentColor}28` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [skills, setSkills]       = useState([])
  const [executions, setExecs]    = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [skillsData, execData] = await Promise.all([
        getSkills(),
        getExecutions({ limit: 10 }),
      ])
      setSkills(skillsData.skills || [])
      setExecs(execData.executions || [])
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll while any execution is active
  useEffect(() => {
    const hasActive = executions.some(e => e.status === 'RUNNING' || e.status === 'WAITING_APPROVAL')
    if (!hasActive) return
    const id = setInterval(fetchAll, 4000)
    return () => clearInterval(id)
  }, [executions, fetchAll])

  const stats = useMemo(() => {
    const total      = skills.length
    const published  = skills.filter(s => s.status === 'published').length
    const totalExecs = executions.length
    const active     = executions.filter(e => e.status === 'RUNNING' || e.status === 'WAITING_APPROVAL').length
    return { total, published, totalExecs, active }
  }, [skills, executions])

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl">

      {/* Header */}
      <header className="animate-fade-in-up flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
            <Layers className="w-3.5 h-3.5" />
            Dynamic Skills Platform
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight">
            <span className="text-gradient">SkillsAgent</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-lg">
            Build, manage, and execute AI-powered skill workflows with human-in-the-loop controls.
          </p>
        </div>
        {stats.active > 0 && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            <span className="text-xs font-medium text-blue-400">{stats.active} active</span>
          </div>
        )}
      </header>

      {/* Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ animationDelay: '0.05s' }}>
        <StatTile
          label="Total Skills"    value={stats.total}
          subtitle="Registered workflows"
          icon={<Layers className="w-4 h-4" />}
          accentColor="#6366f1" delay={0.0}
        />
        <StatTile
          label="Published"       value={stats.published}
          subtitle="Ready to execute"
          icon={<Zap className="w-4 h-4" />}
          accentColor="#10b981" delay={0.05}
        />
        <StatTile
          label="Executions"      value={stats.totalExecs}
          subtitle="Lifetime runs"
          icon={<Activity className="w-4 h-4" />}
          accentColor="#3b82f6" delay={0.1}
        />
        <StatTile
          label="Active Runs"     value={stats.active}
          subtitle="Currently running"
          icon={<Play className="w-4 h-4" />}
          accentColor="#f59e0b" delay={0.15}
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <Link
          to="/skills/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> New Skill
        </Link>
        <Link
          to="/executions"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-glass bg-white/[0.03] hover:bg-white/[0.07] text-xs font-semibold transition-all"
        >
          <Activity className="w-3.5 h-3.5" /> Execution History
        </Link>
      </div>

      {error && (
        <div className="card p-4 border-red-800/40 bg-red-950/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Skills Table */}
      <div className="card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <div className="px-6 py-4 border-b border-glass flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Skills</h2>
          <Link
            to="/skills/new"
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            New <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 animate-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Layers className="w-5 h-5 text-muted-foreground" />}
              title="No skills yet"
              description="Create your first skill to build an AI-powered workflow with defined tools and human approval gates."
              action={
                <Link to="/skills/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground/10 text-foreground text-xs font-medium border border-border hover:bg-foreground/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Create First Skill
                </Link>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-glass/40">
            {skills.map((skill, idx) => {
              const v = skill.latestVersion
              return (
                <div
                  key={skill._id}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors group animate-slide-in-row"
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground truncate">{skill.name}</p>
                      <StatusBadge status={skill.status} />
                      {v && v.status !== skill.status && <StatusBadge status={v.status} />}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-muted-foreground truncate">{skill.purpose}</p>
                      {v && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                            v{v.versionNumber} · {v.allowedTools?.length || 0} tools · max {v.maxSteps} steps
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {skill.status === 'published' && (
                      <Link to={`/skills/${skill._id}/test`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[11px] font-semibold hover:opacity-90 transition-all">
                        <Play className="w-3 h-3" /> Run
                      </Link>
                    )}
                    <Link to={`/skills/${skill._id}/edit`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-glass bg-white/[0.03] hover:bg-white/[0.07] text-[11px] font-medium transition-all">
                      Edit
                    </Link>
                    <Link to={`/skills/${skill._id}/versions`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors">
                      Versions
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Executions */}
      {executions.length > 0 && (
        <div className="card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="px-6 py-4 border-b border-glass flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Executions</h2>
            <Link to="/executions" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-glass/40">
            {executions.slice(0, 5).map((ex, idx) => {
              const isActive = ex.status === 'RUNNING' || ex.status === 'WAITING_APPROVAL'
              return (
                <Link
                  key={ex._id}
                  to={`/executions/${ex._id}`}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-white/[0.02] transition-colors animate-slide-in-row"
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-mono text-foreground truncate">{ex._id.substring(0, 12)}…</p>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="text-[10px] text-muted-foreground font-mono">v{ex.versionNumber}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {JSON.stringify(ex.input).substring(0, 80)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isActive && (
                      <span className="flex items-center gap-1.5 text-[10px] text-blue-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Live
                      </span>
                    )}
                    <StatusBadge status={ex.status} />
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
