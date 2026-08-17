import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Settings2, Shield, Cpu, ChevronRight, CheckCircle2, AlertCircle, Plus, Trash2, Code2, ChevronDown, ChevronUp } from 'lucide-react'
import { getSkill, createSkill, updateSkill, validateSkill, publishSkill } from '../api/client'
import { FullPageLoader, InlineSpinner } from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import { fieldsToSchema, schemaToFields, ALLOWED_TYPES, validateFieldDefinitions } from '../utils/schemaBuilder'

const AVAILABLE_TOOLS = [
  { name: 'calculator',       label: 'Calculator',      type: 'read',  desc: 'Evaluate math expressions' },
  { name: 'document_search',  label: 'Document Search', type: 'read',  desc: 'Search knowledge base documents' },
  { name: 'record_lookup',    label: 'Record Lookup',   type: 'read',  desc: 'Look up customers, orders, tickets' },
  { name: 'mock_task_creator',label: 'Task Creator',    type: 'write', desc: 'Create support tasks — requires approval' },
]

const LIFECYCLE_STEPS = [
  { id: 'create', label: 'Create' },
  { id: 'configure', label: 'Configure' },
  { id: 'validate', label: 'Validate' },
  { id: 'publish', label: 'Publish' },
  { id: 'test', label: 'Test' },
  { id: 'execute', label: 'Execute' },
  { id: 'approve', label: 'Approve' },
  { id: 'review', label: 'Review' },
]

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

function FieldBuilderSection({ title, subtitle, fields, onChange, idPrefix }) {
  const [showJsonPreview, setShowJsonPreview] = useState(false)

  function updateField(index, key, value) {
    const updated = fields.map((f, i) => (i === index ? { ...f, [key]: value } : f))
    onChange(updated)
  }

  function removeField(index) {
    const updated = fields.filter((_, i) => i !== index)
    onChange(updated)
  }

  function addField() {
    onChange([...fields, { name: '', description: '', type: 'Text', required: true }])
  }

  const generatedSchema = fieldsToSchema(fields)

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-glass flex items-center justify-between">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowJsonPreview(!showJsonPreview)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono transition-colors"
        >
          <Code2 className="w-3.5 h-3.5" />
          {showJsonPreview ? 'Hide schema' : 'View generated schema'}
          {showJsonPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {fields.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border/60 rounded-lg text-muted-foreground text-xs">
            No fields defined yet. Click below to add information fields.
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-border/60 bg-muted/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
              >
                <div className="sm:col-span-3">
                  <label className="text-[10px] text-muted-foreground uppercase font-mono mb-1 block">Field Name</label>
                  <input
                    id={`${idPrefix}-name-${idx}`}
                    className="glass-input text-xs"
                    value={field.name}
                    onChange={(e) => updateField(idx, 'name', e.target.value)}
                    placeholder="e.g. customerId"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="text-[10px] text-muted-foreground uppercase font-mono mb-1 block">Description</label>
                  <input
                    id={`${idPrefix}-desc-${idx}`}
                    className="glass-input text-xs"
                    value={field.description}
                    onChange={(e) => updateField(idx, 'description', e.target.value)}
                    placeholder="Brief description"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[10px] text-muted-foreground uppercase font-mono mb-1 block">Type</label>
                  <select
                    id={`${idPrefix}-type-${idx}`}
                    className="glass-input text-xs py-1.5"
                    value={field.type}
                    onChange={(e) => updateField(idx, 'type', e.target.value)}
                  >
                    {ALLOWED_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                    <input
                      id={`${idPrefix}-req-${idx}`}
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(idx, 'required', e.target.checked)}
                      className="w-3.5 h-3.5 accent-foreground rounded"
                    />
                    <span className="text-muted-foreground font-mono text-[11px]">Required</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    className="text-muted-foreground hover:text-red-400 p-1 transition-colors"
                    title="Remove field"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          id={`${idPrefix}-add-btn`}
          onClick={addField}
          className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Field
        </button>

        {showJsonPreview && (
          <div className="mt-4 pt-4 border-t border-glass">
            <p className="text-[11px] text-muted-foreground font-mono mb-2">
              Generated JSON Schema (Read-only machine-readable contract):
            </p>
            <pre className="p-3 rounded-lg bg-black/40 border border-border/40 font-mono text-[11px] text-emerald-400 overflow-x-auto">
              {JSON.stringify(generatedSchema, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SkillEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [validating, setValidating] = useState(false)

  const [form, setForm] = useState({
    name: '',
    purpose: '',
    instructions: '',
    inputFields: [
      { name: 'customerId', description: 'Unique customer identifier', type: 'Text', required: true },
      { name: 'issue', description: 'Description of the customer issue', type: 'Long text', required: true },
    ],
    outputFields: [
      { name: 'summary', description: 'Investigation summary and action taken', type: 'Long text', required: true },
      { name: 'taskCreated', description: 'Whether a support task was created', type: 'Boolean', required: false },
    ],
    allowedTools: ['record_lookup', 'document_search', 'mock_task_creator'],
    approvalRequiredActions: ['mock_task_creator'],
    maxSteps: 8,
    examples: [],
  })

  const [versionStatus, setVersionStatus] = useState('draft')
  const [skillId, setSkillId] = useState(id)
  const [errors, setErrors] = useState([])
  const [successMsg, setSuccessMsg] = useState('')
  const [validationResult, setValidationResult] = useState(null)

  useEffect(() => {
    if (!isNew) {
      getSkill(id)
        .then(({ skill, version }) => {
          const loadedInputFields = schemaToFields(version?.inputSchema)
          const loadedOutputFields = schemaToFields(version?.outputSchema)

          setForm({
            name: skill.name,
            purpose: skill.purpose,
            instructions: version?.instructions || '',
            inputFields: loadedInputFields.length > 0 ? loadedInputFields : [
              { name: 'input', description: 'Input data', type: 'Text', required: true },
            ],
            outputFields: loadedOutputFields.length > 0 ? loadedOutputFields : [
              { name: 'output', description: 'Output result', type: 'Text', required: false },
            ],
            allowedTools: version?.allowedTools || [],
            approvalRequiredActions: version?.approvalRequiredActions || [],
            maxSteps: version?.maxSteps || 8,
            examples: version?.examples || [],
          })
          setVersionStatus(version?.status || 'draft')
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  async function handleSave() {
    setErrors([])
    setSuccessMsg('')

    const valIn = validateFieldDefinitions(form.inputFields)
    if (!valIn.valid) {
      setErrors(valIn.errors.map((e) => `Input field error: ${e}`))
      return
    }

    const valOut = validateFieldDefinitions(form.outputFields)
    if (!valOut.valid) {
      setErrors(valOut.errors.map((e) => `Output field error: ${e}`))
      return
    }

    const inputSchema = fieldsToSchema(form.inputFields)
    const outputSchema = fieldsToSchema(form.outputFields)

    const payload = {
      name: form.name,
      purpose: form.purpose,
      instructions: form.instructions,
      inputSchema,
      outputSchema,
      inputFields: form.inputFields,
      outputFields: form.outputFields,
      allowedTools: form.allowedTools,
      approvalRequiredActions: form.approvalRequiredActions,
      maxSteps: Number(form.maxSteps),
      examples: form.examples,
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
    } finally {
      setSaving(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    setValidationResult(null)
    try {
      const result = await validateSkill(skillId)
      setValidationResult(result)
    } catch (err) {
      setValidationResult({ valid: false, errors: [err.response?.data?.error || err.message] })
    } finally {
      setValidating(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setErrors([])
    try {
      await publishSkill(skillId)
      setVersionStatus('published')
      setSuccessMsg('Skill published successfully!')
    } catch (err) {
      const d = err.response?.data
      setErrors(d?.errors || [d?.error || err.message])
    } finally {
      setPublishing(false)
    }
  }

  function toggleTool(toolName) {
    setForm((f) => {
      const allowed = f.allowedTools.includes(toolName)
        ? f.allowedTools.filter((t) => t !== toolName)
        : [...f.allowedTools, toolName]
      const approvalRequired = f.approvalRequiredActions.filter((a) => allowed.includes(a))
      return { ...f, allowedTools: allowed, approvalRequiredActions: approvalRequired }
    })
  }

  function toggleApproval(toolName) {
    const tool = AVAILABLE_TOOLS.find((t) => t.name === toolName)
    if (!tool || tool.type !== 'write') return
    setForm((f) => ({
      ...f,
      approvalRequiredActions: f.approvalRequiredActions.includes(toolName)
        ? f.approvalRequiredActions.filter((a) => a !== toolName)
        : [...f.approvalRequiredActions, toolName],
    }))
  }

  if (loading) return <FullPageLoader text="Loading skill…" />

  const isPublished = versionStatus === 'published'

  // Determine current lifecycle step for indicator
  let currentStepIdx = 0
  if (!isNew && versionStatus === 'draft') currentStepIdx = 1
  if (validationResult?.valid) currentStepIdx = 2
  if (isPublished) currentStepIdx = 3

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      {/* Step progress indicator */}
      <div className="card p-3 border-glass overflow-x-auto">
        <div className="flex items-center justify-between min-w-[550px] px-2 text-[11px] font-mono">
          {LIFECYCLE_STEPS.map((s, i) => {
            const isCompleted = i < currentStepIdx
            const isCurrent = i === currentStepIdx
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : isCurrent
                      ? 'bg-foreground text-background font-bold'
                      : 'bg-muted/20 text-muted-foreground border border-border'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                  {s.label}
                </span>
                {i < LIFECYCLE_STEPS.length - 1 && <span className="text-muted-foreground/30 mx-1">→</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Header */}
      <header className="animate-fade-in-up flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-widest text-[10px] uppercase mb-2">
            <Settings2 className="w-3.5 h-3.5" />
            {isNew ? 'New Skill Configuration' : 'Edit Skill Configuration'}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold tracking-tight text-gradient">
              {isNew ? 'Create Skill' : form.name || 'Edit Skill'}
            </h1>
            {!isNew && <StatusBadge status={versionStatus} />}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {isPublished
              ? 'This version is published. Saving edits will create a new draft version.'
              : 'Define skill purpose, inputs, outputs, allowed tools, and instructions.'}
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
        <div
          className={`card p-3 text-sm space-y-1 animate-scale-in ${
            validationResult.valid
              ? 'border-emerald-800/30 bg-emerald-950/15 text-emerald-300'
              : 'border-amber-800/40 bg-amber-950/15 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {validationResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {validationResult.valid ? 'Validation passed — Skill is ready to publish!' : 'Validation failed'}
          </div>
          {validationResult.errors?.map((e, i) => (
            <div key={i} className="text-xs pl-6">
              • {e}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {/* Basic Info */}
        <SectionCard icon={Settings2} title="Basic Information">
          <Field label="Skill Name *">
            <input
              id="skill-name"
              className="glass-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Customer Issue Resolver"
            />
          </Field>
          <Field label="Purpose *">
            <textarea
              id="skill-purpose"
              className="glass-input resize-none font-sans text-sm h-20"
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="Describe what this skill accomplishes…"
            />
          </Field>
          <Field label="Instructions *" hint="Step-by-step guidance for the AI agent during execution.">
            <textarea
              id="skill-instructions"
              className="glass-input resize-none font-sans text-sm h-32"
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              placeholder="1. Inspect user request... 2. Search policy... 3. Take required action..."
            />
          </Field>
          <Field label="Max Steps" hint="Maximum agent loop iterations (1–50).">
            <input
              id="skill-max-steps"
              type="number"
              min={1}
              max={50}
              className="glass-input w-28"
              value={form.maxSteps}
              onChange={(e) => setForm((f) => ({ ...f, maxSteps: e.target.value }))}
            />
          </Field>
        </SectionCard>

        {/* Input Field Builder */}
        <FieldBuilderSection
          title="What information will this skill receive?"
          subtitle="Define the information fields the agent needs when someone runs this skill."
          fields={form.inputFields}
          onChange={(inputFields) => setForm((f) => ({ ...f, inputFields }))}
          idPrefix="input-field"
        />

        {/* Output Field Builder */}
        <FieldBuilderSection
          title="What should the skill return?"
          subtitle="Define the useful information fields the agent should produce upon completion."
          fields={form.outputFields}
          onChange={(outputFields) => setForm((f) => ({ ...f, outputFields }))}
          idPrefix="output-field"
        />

        {/* Tools & Approvals */}
        <SectionCard icon={Shield} title="Allowed Tools & Approvals">
          <div className="space-y-2">
            {AVAILABLE_TOOLS.map((tool) => {
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
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              tool.type === 'write'
                                ? 'bg-red-900/30 text-red-300 border border-red-800/30'
                                : 'bg-blue-900/30 text-blue-300 border border-blue-800/30'
                            }`}
                          >
                            {tool.type}
                          </span>
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
                        <span className="text-[11px] text-amber-400 font-medium">Require human approval</span>
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
            {saving ? (
              <>
                <InlineSpinner size={12} /> Saving…
              </>
            ) : (
              'Save Draft'
            )}
          </button>
          {!isNew && (
            <>
              <button id="btn-validate" onClick={handleValidate} disabled={validating || !skillId} className="btn-secondary">
                {validating ? (
                  <>
                    <InlineSpinner size={12} /> Validating…
                  </>
                ) : (
                  'Validate'
                )}
              </button>
              <button
                id="btn-publish"
                onClick={handlePublish}
                disabled={publishing || !skillId || isPublished}
                className="btn-primary"
              >
                {publishing ? (
                  <>
                    <InlineSpinner size={12} /> Publishing…
                  </>
                ) : isPublished ? (
                  '✓ Published'
                ) : (
                  'Publish'
                )}
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
