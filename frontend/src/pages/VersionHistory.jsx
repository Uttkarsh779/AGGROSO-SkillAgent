import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { GitBranch, Play, ChevronLeft, ArrowLeftRight } from 'lucide-react'
import { getVersions, compareVersions } from '../api/client'
import { FullPageLoader, InlineSpinner } from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import EmptyState from '../components/common/EmptyState'

function Field({ label, value }) {
  return (
    <div className="py-1.5 border-b border-glass/40 last:border-0">
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs text-foreground font-mono">{value}</p>
    </div>
  )
}

function VersionDetails({ version: v, label }) {
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <StatusBadge status={v.status} />
      </div>
      <Field label="Max Steps"        value={v.maxSteps} />
      <Field label="Tools"            value={v.allowedTools?.join(', ') || 'none'} />
      <Field label="Approval Required"value={v.approvalRequiredActions?.join(', ') || 'none'} />
      <div className="pt-2">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Instructions</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-h-28 overflow-y-auto">
          {v.instructions || '—'}
        </p>
      </div>
    </div>
  )
}

export default function VersionHistory() {
  const { id } = useParams()
  const [versions,   setVersions]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [compareV1,  setCompareV1]  = useState('')
  const [compareV2,  setCompareV2]  = useState('')
  const [comparison, setComparison] = useState(null)
  const [comparing,  setComparing]  = useState(false)

  useEffect(() => {
    getVersions(id)
      .then(data => {
        setVersions(data.versions || [])
        if (data.versions?.length >= 2) {
          setCompareV1(String(data.versions[0].versionNumber))
          setCompareV2(String(data.versions[data.versions.length - 1].versionNumber))
        }
      })
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleCompare() {
    if (!compareV1 || !compareV2) return
    setComparing(true)
    try {
      const data = await compareVersions(id, compareV1, compareV2)
      setComparison(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setComparing(false) }
  }

  if (loading) return <FullPageLoader text="Loading versions…" />

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      {/* Header */}
      <header className="animate-fade-in-up flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
            <GitBranch className="w-3.5 h-3.5" />
            Version History
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gradient">
            Skill Versions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">All versions of this skill with diff comparison.</p>
        </div>
        <Link to={`/skills/${id}/edit`} className="btn-secondary text-xs shrink-0">
          <ChevronLeft className="w-3.5 h-3.5" /> Edit Skill
        </Link>
      </header>

      {error && (
        <div className="card p-3 border-red-800/40 bg-red-950/20 text-red-300 text-sm">{error}</div>
      )}

      {versions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<GitBranch className="w-5 h-5 text-muted-foreground" />}
            title="No versions yet"
            description="Save and publish a skill to see its version history here."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Version list */}
          <div className="card overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b border-glass">
              <h2 className="section-title">All Versions</h2>
            </div>
            <div className="divide-y divide-glass/40">
              {[...versions].reverse().map((v, idx) => (
                <div
                  key={v._id}
                  className="px-6 py-4 hover:bg-white/[0.02] transition-colors animate-slide-in-row"
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-semibold text-foreground">Version {v.versionNumber}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground font-mono mb-2">
                        <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                        <span className="text-muted-foreground/30">·</span>
                        <span>Tools: {v.allowedTools?.join(', ') || 'none'}</span>
                        <span className="text-muted-foreground/30">·</span>
                        <span>Max steps: {v.maxSteps}</span>
                      </div>
                      {v.instructions && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {v.instructions.substring(0, 200)}{v.instructions.length > 200 ? '…' : ''}
                        </p>
                      )}
                    </div>
                    {v.status === 'published' && (
                      <Link
                        to={`/skills/${id}/test?v=${v.versionNumber}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-[11px] font-semibold hover:opacity-90 transition-all shrink-0"
                      >
                        <Play className="w-3 h-3" /> Run
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Version comparison */}
          {versions.length >= 2 && (
            <div className="card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="px-6 py-4 border-b border-glass flex items-center gap-2">
                <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                <h2 className="section-title">Compare Versions</h2>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <select
                    className="glass-input flex-1"
                    value={compareV1}
                    onChange={e => setCompareV1(e.target.value)}
                  >
                    {versions.map(v => (
                      <option key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber} ({v.status})</option>
                    ))}
                  </select>
                  <span className="text-muted-foreground text-sm font-mono shrink-0">vs</span>
                  <select
                    className="glass-input flex-1"
                    value={compareV2}
                    onChange={e => setCompareV2(e.target.value)}
                  >
                    {versions.map(v => (
                      <option key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber} ({v.status})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCompare}
                    disabled={comparing || compareV1 === compareV2}
                    className="btn-secondary text-xs shrink-0"
                  >
                    {comparing ? <><InlineSpinner size={12} /> Comparing…</> : 'Compare'}
                  </button>
                </div>

                {comparison && (
                  <div className="grid grid-cols-2 gap-4 animate-scale-in">
                    <VersionDetails version={comparison.version1} label={`v${comparison.version1.versionNumber}`} />
                    <VersionDetails version={comparison.version2} label={`v${comparison.version2.versionNumber}`} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
