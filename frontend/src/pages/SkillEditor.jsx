import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Settings2, Shield, Cpu, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react'
import { getSkill, createSkill, updateSkill, validateSkill, publishSkill } from '../api/client'
import { FullPageLoader, InlineSpinner } from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'

const AVAILABLE_TOOLS = [
  { name: 'calculator',       label: 'Calculator',      type: 'read',  desc: 'Evaluate math expressions' },
  { name: 'document_search',  label: 'Document Search', type: 'read',  desc: 'Search knowledge base documents' },
  { name: 'record_lookup',    label: 'Record Lookup',   type: 'read',  desc: 'Look up customers, orders, tickets' },
  { name: 'mock_task_creator',label: 'Task Creator',    type: 'write', desc: 'Create support tasks — requires approval' },
]

const DEFAULT_INPUT_SCHEMA  = JSON.stringify({ type: 'object', properties: {}, required: [] }, null, 2)
const DEFAULT_OUTPUT_SCHEMA = JSON.stringify({ type: 'object', properties: {} }, null, 2)

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-glass flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-1">{hint}</p>}
    </div>
  )
}

export default function SkillEditor() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const isNew       = !id || id === 'new'

  const [loading,    setLoading]    = useState(!isNew)
  const [saving,     setSaving]     = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [validating, setValidating] = useState(false)

  const [form, setForm] = useState({
    name: '', purpose: '', instructions: '',
    inputSchema: DEFAULT_INPUT_SCHEMA, outputSchema: DEFAULT_OUTPUT_SCHEMA,
    allowedTools: [], approvalRequiredActions: [], maxSteps: 8, examples: [],
  })

  const [versionStatus,    setVersionStatus]    = useState('draft')
  const [skillId,          setSkillId]          = useState(id)
  const [errors,           setErrors]           = useState([])
  const [successMsg,       setSuccessMsg]       = useState('')
  const [validationResult, setValidationResult] = useState(null)
  const [schemaErrors,     setSchemaErrors]     = useState({})

  useEffect(() => {
    if (!isNew) {
      getSkill(id).then(({ skill, version }) => {
        setForm({
          name: skill.name, purpose: skill.purpose,
          instructions: version?.instructions || '',
          inputSchema:  JSON.stringify(version?.inputSchema  || {}, null, 2),
          outputSchema: JSON.stringify(version?.outputSchema || {}, null, 2),
          allowedTools:           version?.allowedTools           || [],
          approvalRequiredActions:version?.approvalRequiredActions|| [],
          maxSteps: version?.maxSteps || 8,
          examples: version?.examples || [],
        })
        setVersionStatus(version?.status || 'draft')
      }).catch(() => {}).finally(() => setLoading(false))
    }
  }, [id, isNew])

  function parseJsonField(field) {
    try   { return { value: JSON.parse(form[field]), error: null } }
    catch { return { value: null, error: `Invalid JSON in ${field}` } }
  }

  async function handleSave() {
    setErrors([]); setSuccessMsg('')
    const inp = parseJsonField('inputSchema')
    const out = parseJsonField('outputSchema')
    const se  = {}
    if (inp.error) se.inputSchema  = inp.error
    if (out.error) se.outputSchema = out.error
    if (Object.keys(se).length) { setSchemaErrors(se); return }
    setSchemaErrors({})

    const payload = {
      name: form.name, purpose: form.purpose, instructions: form.instructions,
      inputSchema: inp.value, outputSchema: out.value,
      allowedTools: form.allowedTools,
      approvalRequiredActions: form.approvalRequiredActions,
      maxSteps: Number(form.maxSteps), examples: form.examples,
    }
    setSaving(true)
    try {
      let result
      if (isNew) {
        result = await createSkill(payload)
        setSkillId(result.skill._id)
        setVersionStatus(result.version.status)
        navigate(`/skills/${result.skill._id}/edit`, { replace: true })
      } else {
        result = await updateSkill(skillId, payload)
        setVersionStatus(result.version.status)
      }
      setSuccessMsg('Draft saved successfully')
    } catch (err) {
      setErrors([err.response?.data?.error || err.message])
    } finally { setSaving(false) }
  }

  async function handleValidate() {
    setValidating(true); setValidationResult(null)
    try {
      const result = await validateSkill(skillId)
      setValidationResult(result)
    } catch (err) {
      setValidationResult({ valid: false, errors: [err.response?.data?.error || err.message] })
    } finally { setValidating(false) }
  }

  async function handlePublish() {
    setPublishing(true); setErrors([])
    try {
      await publishSkill(skillId)
      setVersionStatus('published')
      setSuccessMsg('Skill published successfully!')
    } catch (err) {
      const d = err.response?.data
      setErrors(d?.errors || [d?.error || err.message])
    } finally { setPublishing(false) }
  }

  function toggleTool(toolName) {
    setForm(f => {
      const allowed = f.allowedTools.includes(toolName)
        ? f.allowedTools.filter(t => t !== toolName)
        : [...f.allowedTools, toolName]
      const approvalRequired = f.approvalRequiredActions.filter(a => allowed.includes(a))
      return { ...f, allowedTools: allowed, approvalRequiredActions: approvalRequired }
    })
  }

  function toggleApproval(toolName) {
    const tool = AVAILABLE_TOOLS.find(t => t.name === toolName)
    if (!tool || tool.type !== 'write') return
    setForm(f => ({
      ...f,
      approvalRequiredActions: f.approvalRequiredActions.includes(toolName)
        ? f.approvalRequiredActions.filter(a => a !== toolName)
        : [...f.approvalRequiredActions, toolName],
    }))
  }

  if (loading) return <FullPageLoader text="Loading skill…" />

  const isPublished = versionStatus === 'published'

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      {/* Header */}
      <header className="animate-fade-in-up flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
            <Settings2 className="w-3.5 h-3.5" />
            {isNew ? 'New Skill' : 'Edit Skill'}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold tracking-tight text-gradient">
              {isNew ? 'Create Skill' : (form.name || 'Edit Skill')}
            </h1>
            {!isNew && <StatusBadge status={versionStatus} />}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {isPublished
              ? 'This version is published. Saving will create a new draft.'
              : 'Draft — save changes, validate, then publish.'}
          </p>
        </div>
      </header>

      {/* Alert messages */}
      {successMsg && (
        <div className="card p-3 border-emerald-800/30 bg-emerald-950/15 flex items-center gap-2 text-emerald-300 text-sm animate-scale-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errors.length > 0 && (
        <div className="card p-3 border-red-800/40 bg-red-950/15 text-red-300 text-sm space-y-1 animate-scale-in">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}
      {validationResult && (
        <div className={`card p-3 text-sm space-y-1 animate-scale-in ${
          validationResult.valid
            ? 'border-emerald-800/30 bg-emerald-950/15 text-emerald-300'
            : 'border-amber-800/40 bg-amber-950/15 text-amber-300'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {validationResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {validationResult.valid ? 'Validation passed' : 'Validation failed'}
          </div>
          {validationResult.errors?.map((e, i) => <div key={i} className="text-xs pl-6">• {e}</div>)}
        </div>
      )}

      <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {/* Basic Info */}
        <SectionCard icon={Settings2} title="Basic Information">
          <Field label="Skill Name *">
            <input
              id="skill-name"
              className="glass-input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Customer Issue Resolver"
            />
          </Field>
          <Field label="Purpose *">
            <textarea
              id="skill-purpose"
              className="glass-input resize-none font-sans text-sm h-20"
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              placeholder="Describe what this skill does…"
            />
          </Field>
          <Field label="Instructions *" hint="Detailed guidance for the AI agent.">
            <textarea
              id="skill-instructions"
              className="glass-input resize-none font-sans text-sm h-32"
              value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              placeholder="Step-by-step instructions for the AI agent…"
            />
          </Field>
          <Field label="Max Steps" hint="Maximum agent loop iterations (1–50).">
            <input
              id="skill-max-steps"
              type="number"
              min={1} max={50}
              className="glass-input w-28"
              value={form.maxSteps}
              onChange={e => setForm(f => ({ ...f, maxSteps: e.target.value }))}
            />
          </Field>
        </SectionCard>

        {/* Schemas */}
        <SectionCard icon={Cpu} title="Input / Output Schemas">
          <Field label="Input Schema (JSON Schema)">
            <textarea
              id="skill-input-schema"
              className={`glass-input resize-none font-mono text-xs h-28 ${schemaErrors.inputSchema ? 'border-red-600' : ''}`}
              value={form.inputSchema}
              onChange={e => setForm(f => ({ ...f, inputSchema: e.target.value }))}
            />
            {schemaErrors.inputSchema && <p className="text-xs text-red-400 mt-1">{schemaErrors.inputSchema}</p>}
          </Field>
          <Field label="Output Schema (JSON Schema)">
            <textarea
              id="skill-output-schema"
              className={`glass-input resize-none font-mono text-xs h-24 ${schemaErrors.outputSchema ? 'border-red-600' : ''}`}
              value={form.outputSchema}
              onChange={e => setForm(f => ({ ...f, outputSchema: e.target.value }))}
            />
            {schemaErrors.outputSchema && <p className="text-xs text-red-400 mt-1">{schemaErrors.outputSchema}</p>}
          </Field>
        </SectionCard>

        {/* Tools */}
        <SectionCard icon={Shield} title="Allowed Tools & Approvals">
          <div className="space-y-2">
            {AVAILABLE_TOOLS.map(tool => {
              const isSelected = form.allowedTools.includes(tool.name)
              return (
                <div
                  key={tool.name}
                  className={`rounded-lg border p-3.5 transition-all ${
                    isSelected
                      ? 'border-foreground/20 bg-white/[0.04]'
                      : 'border-border bg-transparent hover:border-border/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                      <input
                        id={`tool-${tool.name}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTool(tool.name)}
                        className="w-3.5 h-3.5 accent-foreground rounded"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{tool.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            tool.type === 'write'
                              ? 'bg-red-900/30 text-red-300 border border-red-800/30'
                              : 'bg-blue-900/30 text-blue-300 border border-blue-800/30'
                          }`}>{tool.type}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{tool.desc}</p>
                      </div>
                    </label>

                    {tool.type === 'write' && isSelected && (
                      <label className="flex items-center gap-2 cursor-pointer ml-4 shrink-0">
                        <input
                          id={`approval-${tool.name}`}
                          type="checkbox"
                          checked={form.approvalRequiredActions.includes(tool.name)}
                          onChange={() => toggleApproval(tool.name)}
                          className="w-3.5 h-3.5 accent-amber-400 rounded"
                        />
                        <span className="text-[11px] text-amber-400 font-medium">Require approval</span>
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button id="btn-save-draft" onClick={handleSave} disabled={saving} className="btn-secondary">
            {saving ? <><InlineSpinner size={12} /> Saving…</> : 'Save Draft'}
          </button>
          {!isNew && (
            <>
              <button id="btn-validate" onClick={handleValidate} disabled={validating || !skillId} className="btn-secondary">
                {validating ? <><InlineSpinner size={12} /> Validating…</> : 'Validate'}
              </button>
              <button
                id="btn-publish"
                onClick={handlePublish}
                disabled={publishing || !skillId || isPublished}
                className="btn-primary"
              >
                {publishing ? <><InlineSpinner size={12} /> Publishing…</> : isPublished ? '✓ Published' : 'Publish'}
              </button>
            </>
          )}
          {!isNew && (
            <button
              id="btn-test"
              onClick={() => navigate(`/skills/${skillId}/test`)}
              className="btn-ghost ml-auto flex items-center gap-1.5"
            >
              Test Skill <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
