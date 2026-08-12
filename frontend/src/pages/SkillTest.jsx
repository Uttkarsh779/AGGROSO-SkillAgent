import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Cpu } from 'lucide-react'
import { getSkill, getVersions, executeSkill } from '../api/client'
import { FullPageLoader, InlineSpinner } from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'

export default function SkillTest() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [skill,           setSkill]           = useState(null)
  const [versions,        setVersions]        = useState([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [inputText,       setInputText]       = useState('')
  const [loading,         setLoading]         = useState(true)
  const [running,         setRunning]         = useState(false)
  const [error,           setError]           = useState(null)
  const [inputError,      setInputError]      = useState(null)

  useEffect(() => {
    Promise.all([getSkill(id), getVersions(id)])
      .then(([skillData, versionData]) => {
        setSkill(skillData.skill)
        const published = versionData.versions.filter(v => v.status === 'published')
        setVersions(published)
        if (published.length > 0) {
          setSelectedVersion(String(published[published.length - 1].versionNumber))
          const demo = published[published.length - 1].examples?.[0]?.input
          setInputText(demo ? JSON.stringify(demo, null, 2) : JSON.stringify({}, null, 2))
        }
      })
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleRun() {
    setInputError(null)
    let parsedInput
    try { parsedInput = JSON.parse(inputText) }
    catch { setInputError('Input must be valid JSON'); return }

    setRunning(true)
    try {
      const data = await executeSkill(id, {
        input: parsedInput,
        versionNumber: selectedVersion ? Number(selectedVersion) : undefined,
      })
      navigate(`/executions/${data.execution._id}`)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setRunning(false) }
  }

  if (loading) return <FullPageLoader text="Loading skill…" />

  if (error && !skill) return (
    <div className="p-8">
      <div className="card p-4 border-red-800/40 bg-red-950/20 text-red-300 text-sm">Error: {error}</div>
    </div>
  )

  const selectedV = versions.find(v => String(v.versionNumber) === selectedVersion)

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6 animate-fade-in">
      {/* Header */}
      <header className="animate-fade-in-up">
        <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
          <Play className="w-3.5 h-3.5" />
          Test Skill
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold tracking-tight text-gradient">
            {skill?.name || 'Test Skill'}
          </h1>
          {skill && <StatusBadge status={skill.status} />}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">Execute this skill and track its real-time progress.</p>
      </header>

      {error && (
        <div className="card p-3 border-red-800/40 bg-red-950/20 text-red-300 text-sm animate-fade-in">{error}</div>
      )}

      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {/* Version selector */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-glass flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="section-title">Select Version</h2>
          </div>
          <div className="p-5">
            {versions.length === 0 ? (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <span>⚠</span> No published versions. Publish the skill first.
              </div>
            ) : (
              <select
                id="version-select"
                className="glass-input"
                value={selectedVersion}
                onChange={e => {
                  setSelectedVersion(e.target.value)
                  const v = versions.find(v => String(v.versionNumber) === e.target.value)
                  const demo = v?.examples?.[0]?.input
                  if (demo) setInputText(JSON.stringify(demo, null, 2))
                }}
              >
                {versions.map(v => (
                  <option key={v.versionNumber} value={v.versionNumber}>
                    Version {v.versionNumber} — {v.status}
                  </option>
                ))}
              </select>
            )}

            {/* Version details pill */}
            {selectedV && (
              <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground font-mono">
                <span className="px-2 py-1 rounded-full border border-border bg-muted/20">
                  Tools: {selectedV.allowedTools?.join(', ') || 'none'}
                </span>
                <span className="px-2 py-1 rounded-full border border-border bg-muted/20">
                  Max steps: {selectedV.maxSteps}
                </span>
                {selectedV.approvalRequiredActions?.length > 0 && (
                  <span className="px-2 py-1 rounded-full border border-amber-800/40 bg-amber-950/20 text-amber-400">
                    Approval: {selectedV.approvalRequiredActions.join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input JSON */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-glass">
            <h2 className="section-title">Input (JSON)</h2>
          </div>
          <div className="p-5">
            <textarea
              id="skill-input"
              className={`glass-input resize-none font-mono text-xs h-48 ${inputError ? 'border-red-600' : ''}`}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder='{"customerId": "C102", "complaint": "..."}'
              spellCheck={false}
            />
            {inputError && <p className="text-xs text-red-400 mt-1">{inputError}</p>}
          </div>
        </div>

        {/* Run button */}
        <button
          id="btn-run-skill"
          onClick={handleRun}
          disabled={running || versions.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-foreground text-background font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-40"
        >
          {running
            ? <><InlineSpinner size={14} /> Starting execution…</>
            : <><Play className="w-4 h-4" /> Run Skill</>
          }
        </button>
      </div>
    </div>
  )
}
