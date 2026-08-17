import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Cpu, Code2, ChevronDown, ChevronUp } from 'lucide-react'
import { getSkill, getVersions, executeSkill } from '../api/client'
import { FullPageLoader, InlineSpinner } from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import { schemaToFields } from '../utils/schemaBuilder'

export default function SkillTest() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [skill, setSkill] = useState(null)
  const [versions, setVersions] = useState([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [inputFields, setInputFields] = useState([])
  const [formValues, setFormValues] = useState({})
  const [showRawJson, setShowRawJson] = useState(false)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getSkill(id), getVersions(id)])
      .then(([skillData, versionData]) => {
        setSkill(skillData.skill)
        const published = versionData.versions.filter((v) => v.status === 'published')
        setVersions(published)

        // Select latest published version, or latest draft version if no published versions yet
        const targetVersion = published.length > 0 ? published[published.length - 1] : versionData.versions[versionData.versions.length - 1]

        if (targetVersion) {
          setSelectedVersion(String(targetVersion.versionNumber))
          setupFormForVersion(targetVersion)
        }
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false))
  }, [id])

  function setupFormForVersion(version) {
    const fields = schemaToFields(version?.inputSchema)
    setInputFields(fields)

    // Pre-populate with example values if available, or empty defaults
    const exampleInput = version?.examples?.[0]?.input || {}
    const initialValues = {}

    if (fields.length > 0) {
      fields.forEach((f) => {
        if (exampleInput[f.name] !== undefined) {
          initialValues[f.name] = exampleInput[f.name]
        } else {
          initialValues[f.name] = f.type === 'Boolean' ? false : f.type === 'Number' ? 0 : ''
        }
      })
    } else if (Object.keys(exampleInput).length > 0) {
      Object.assign(initialValues, exampleInput)
    }

    setFormValues(initialValues)
  }

  function handleVersionChange(vnum) {
    setSelectedVersion(vnum)
    const v = versions.find((ver) => String(ver.versionNumber) === vnum)
    if (v) {
      setupFormForVersion(v)
    }
  }

  function handleFieldChange(name, value, type) {
    let parsedValue = value
    if (type === 'Number') {
      parsedValue = value === '' ? '' : Number(value)
    }
    setFormValues((prev) => ({ ...prev, [name]: parsedValue }))
  }

  async function handleRun() {
    setError(null)
    setRunning(true)

    // Clean empty values before submitting
    const cleanedInput = {}
    Object.entries(formValues).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) {
        cleanedInput[k] = v
      }
    })

    try {
      const data = await executeSkill(id, {
        input: cleanedInput,
        versionNumber: selectedVersion ? Number(selectedVersion) : undefined,
      })
      navigate(`/executions/${data.execution._id}`)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <FullPageLoader text="Loading skill execution interface…" />

  if (error && !skill)
    return (
      <div className="p-8">
        <div className="card p-4 border-red-800/40 bg-red-950/20 text-red-300 text-sm">Error: {error}</div>
      </div>
    )

  const selectedV = versions.find((v) => String(v.versionNumber) === selectedVersion)

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6 animate-fade-in">
      {/* Header */}
      <header className="animate-fade-in-up">
        <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
          <Play className="w-3.5 h-3.5 text-emerald-400" />
          Test & Execute Skill
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold tracking-tight text-gradient">
            {skill?.name || 'Test Skill'}
          </h1>
          {skill && <StatusBadge status={skill.status} />}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Provide runtime input for the skill and execute the agent loop in real-time.
        </p>
      </header>

      {error && (
        <div className="card p-3 border-red-800/40 bg-red-950/20 text-red-300 text-sm animate-fade-in">{error}</div>
      )}

      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {/* Version selector */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-glass flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="section-title">Skill Version</h2>
          </div>
          <div className="p-5">
            {versions.length === 0 ? (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <span>⚠</span> No published versions found. Publish the skill draft to execute.
              </div>
            ) : (
              <select
                id="version-select"
                className="glass-input"
                value={selectedVersion}
                onChange={(e) => handleVersionChange(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.versionNumber} value={v.versionNumber}>
                    Version {v.versionNumber} — {v.status}
                  </option>
                ))}
              </select>
            )}

            {/* Version details pill */}
            {selectedV && (
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground font-mono">
                <span className="px-2 py-1 rounded-full border border-border bg-muted/20">
                  Allowed Tools: {selectedV.allowedTools?.join(', ') || 'none'}
                </span>
                <span className="px-2 py-1 rounded-full border border-border bg-muted/20">
                  Max Steps: {selectedV.maxSteps}
                </span>
                {selectedV.approvalRequiredActions?.length > 0 && (
                  <span className="px-2 py-1 rounded-full border border-amber-800/40 bg-amber-950/20 text-amber-400">
                    Approval Required: {selectedV.approvalRequiredActions.join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Form Input Card */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-glass flex items-center justify-between">
            <div>
              <h2 className="section-title">Input Information</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Fill out the fields required by this skill.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono transition-colors"
            >
              <Code2 className="w-3.5 h-3.5" />
              {showRawJson ? 'Hide raw JSON' : 'View raw JSON'}
              {showRawJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="p-5 space-y-4">
            {inputFields.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                This skill does not require structured input fields. Click Run Skill to execute.
              </div>
            ) : (
              inputFields.map((f) => (
                <div key={f.name} className="space-y-1">
                  <label className="label flex items-center justify-between">
                    <span>
                      {f.name} {f.required && <span className="text-red-400">*</span>}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">{f.type}</span>
                  </label>
                  {f.description && <p className="text-xs text-muted-foreground/80">{f.description}</p>}

                  {f.type === 'Long text' ? (
                    <textarea
                      id={`input-form-${f.name}`}
                      className="glass-input resize-none font-sans text-sm h-24 mt-1"
                      value={formValues[f.name] || ''}
                      onChange={(e) => handleFieldChange(f.name, e.target.value, f.type)}
                      placeholder={`Enter ${f.name}...`}
                    />
                  ) : f.type === 'Boolean' ? (
                    <label className="flex items-center gap-2 pt-1 cursor-pointer">
                      <input
                        id={`input-form-${f.name}`}
                        type="checkbox"
                        checked={Boolean(formValues[f.name])}
                        onChange={(e) => handleFieldChange(f.name, e.target.checked, f.type)}
                        className="w-4 h-4 accent-foreground rounded"
                      />
                      <span className="text-xs text-muted-foreground">Enable</span>
                    </label>
                  ) : f.type === 'Number' ? (
                    <input
                      id={`input-form-${f.name}`}
                      type="number"
                      className="glass-input text-sm"
                      value={formValues[f.name] !== undefined ? formValues[f.name] : ''}
                      onChange={(e) => handleFieldChange(f.name, e.target.value, f.type)}
                      placeholder={`Enter ${f.name}...`}
                    />
                  ) : f.type === 'Date' ? (
                    <input
                      id={`input-form-${f.name}`}
                      type="date"
                      className="glass-input text-sm"
                      value={formValues[f.name] || ''}
                      onChange={(e) => handleFieldChange(f.name, e.target.value, f.type)}
                    />
                  ) : (
                    <input
                      id={`input-form-${f.name}`}
                      type="text"
                      className="glass-input text-sm"
                      value={formValues[f.name] || ''}
                      onChange={(e) => handleFieldChange(f.name, e.target.value, f.type)}
                      placeholder={`Enter ${f.name}...`}
                    />
                  )}
                </div>
              ))
            )}

            {showRawJson && (
              <div className="mt-4 pt-4 border-t border-glass">
                <p className="text-[11px] text-muted-foreground font-mono mb-2">
                  Constructed JSON Payload (Submitted to Agent Engine):
                </p>
                <pre className="p-3 rounded-lg bg-black/40 border border-border/40 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                  {JSON.stringify(formValues, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Run button */}
        <button
          id="btn-run-skill"
          onClick={handleRun}
          disabled={running || versions.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-foreground text-background font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-40"
        >
          {running ? (
            <>
              <InlineSpinner size={14} /> Starting execution…
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" /> Run Skill
            </>
          )}
        </button>
      </div>
    </div>
  )
}
