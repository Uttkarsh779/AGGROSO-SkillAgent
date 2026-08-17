/**
 * Frontend Schema Builder Utility — Deterministic helper functions for converting
 * interactive field definitions into standard JSON Schema objects, and parsing
 * existing schemas into form field lists for the non-technical UI.
 */

export const ALLOWED_TYPES = ['Text', 'Long text', 'Number', 'Boolean', 'Date']

export function sanitizeFieldName(name) {
  if (!name) return ''
  const trimmed = name.trim()
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return trimmed
  }
  return trimmed
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
}

export function fieldsToSchema(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { type: 'object', properties: {} }
  }

  const properties = {}
  const required = []

  for (const field of fields) {
    if (!field || !field.name) continue
    const key = sanitizeFieldName(field.name)
    if (!key) continue

    const desc = field.description ? String(field.description).trim() : ''

    switch (field.type) {
      case 'Number':
        properties[key] = { type: 'number', description: desc || `${field.name} numeric value` }
        break
      case 'Boolean':
        properties[key] = { type: 'boolean', description: desc || `${field.name} boolean flag` }
        break
      case 'Date':
        properties[key] = { type: 'string', description: desc ? `${desc} (Date YYYY-MM-DD)` : `${field.name} date` }
        break
      case 'Long text':
        properties[key] = { type: 'string', description: desc ? `${desc} (Long text)` : `${field.name} long text` }
        break
      case 'Text':
      default:
        properties[key] = { type: 'string', description: desc || `${field.name}` }
        break
    }

    if (field.required) {
      required.push(key)
    }
  }

  const schema = {
    type: 'object',
    properties,
  }

  if (required.length > 0) {
    schema.required = required
  }

  return schema
}

export function schemaToFields(schema) {
  if (!schema || typeof schema !== 'object' || !schema.properties) {
    return []
  }

  const requiredList = Array.isArray(schema.required) ? schema.required : []
  const fields = []

  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!prop || typeof prop !== 'object') continue

    let type = 'Text'
    let desc = prop.description || ''

    if (prop.type === 'number' || prop.type === 'integer') {
      type = 'Number'
    } else if (prop.type === 'boolean') {
      type = 'Boolean'
    } else if (prop.type === 'string') {
      if (desc.includes('(Date') || desc.toLowerCase().includes('date')) {
        type = 'Date'
      } else if (
        desc.includes('(Long text)') ||
        desc.toLowerCase().includes('complaint') ||
        desc.toLowerCase().includes('instructions') ||
        desc.toLowerCase().includes('purpose') ||
        desc.toLowerCase().includes('question') ||
        desc.toLowerCase().includes('resolution') ||
        desc.toLowerCase().includes('summary') ||
        desc.toLowerCase().includes('issue')
      ) {
        type = 'Long text'
      } else {
        type = 'Text'
      }
    }

    const cleanDesc = desc.replace(/\s*\((Date|Long text)[^)]*\)/g, '').trim()

    fields.push({
      name: key,
      description: cleanDesc || desc,
      type,
      required: requiredList.includes(key),
    })
  }

  return fields
}

export function validateFieldDefinitions(fields) {
  const errors = []
  if (!Array.isArray(fields)) {
    return { valid: false, errors: ['Fields must be an array'] }
  }

  const seenNames = new Set()

  fields.forEach((field, index) => {
    const idxStr = `Field ${index + 1}`
    if (!field || typeof field !== 'object') {
      errors.push(`${idxStr} must be an object`)
      return
    }

    const name = field.name ? String(field.name).trim() : ''
    if (!name) {
      errors.push(`${idxStr} name is required`)
    } else {
      if (!/^[a-zA-Z0-9_\-\s]+$/.test(name)) {
        errors.push(`${idxStr} name "${name}" contains invalid characters`)
      }
      const normalizedKey = sanitizeFieldName(name)
      if (seenNames.has(normalizedKey)) {
        errors.push(`Duplicate field name "${name}"`)
      }
      seenNames.add(normalizedKey)
    }

    const type = field.type || 'Text'
    if (!ALLOWED_TYPES.includes(type)) {
      errors.push(`${idxStr} type "${type}" is invalid. Allowed: ${ALLOWED_TYPES.join(', ')}`)
    }
  })

  return { valid: errors.length === 0, errors }
}
