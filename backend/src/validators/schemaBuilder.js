/**
 * Schema Builder — Canonical backend module for converting form field definitions
 * into valid JSON Schema objects, and parsing JSON Schema objects back into field definitions.
 *
 * Supported evaluator field types:
 * - Text (string)
 * - Long text (string with long text indicator)
 * - Number (number)
 * - Boolean (boolean)
 * - Date (string)
 */

const ALLOWED_TYPES = ['Text', 'Long text', 'Number', 'Boolean', 'Date'];

/**
 * Validate an array of field definitions.
 * Returns { valid: boolean, errors: string[] }
 */
function validateFieldDefinitions(fields) {
  const errors = [];
  if (!Array.isArray(fields)) {
    return { valid: false, errors: ['Fields must be an array'] };
  }

  const seenNames = new Set();

  fields.forEach((field, index) => {
    const idxStr = `Field ${index + 1}`;
    if (!field || typeof field !== 'object') {
      errors.push(`${idxStr} must be an object`);
      return;
    }

    const name = field.name ? String(field.name).trim() : '';
    if (!name) {
      errors.push(`${idxStr} name is required`);
    } else {
      // Validate field name format (alphanumeric, camelCase, underscore)
      if (!/^[a-zA-Z0-9_\-\s]+$/.test(name)) {
        errors.push(`${idxStr} name "${name}" contains invalid characters`);
      }
      const normalizedKey = sanitizeFieldName(name);
      if (seenNames.has(normalizedKey)) {
        errors.push(`Duplicate field name "${name}" (normalized as "${normalizedKey}")`);
      }
      seenNames.add(normalizedKey);
    }

    const type = field.type || 'Text';
    if (!ALLOWED_TYPES.includes(type)) {
      errors.push(`${idxStr} type "${type}" is invalid. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize field name to valid JS property key (camelCase style or alphanumeric).
 */
function sanitizeFieldName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  // If already camelCase / clean identifier, keep it
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return trimmed;
  }
  // Otherwise convert spaces / dashes to camelCase
  return trimmed
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Deterministically convert field definitions array into JSON Schema.
 *
 * Input format:
 * [
 *   { name: 'customerId', description: 'Unique customer ID', type: 'Text', required: true },
 *   { name: 'issue', description: 'Customer complaint', type: 'Long text', required: true }
 * ]
 *
 * Output format:
 * {
 *   type: 'object',
 *   properties: {
 *     customerId: { type: 'string', description: 'Unique customer ID' },
 *     issue: { type: 'string', description: 'Customer complaint (long text)' }
 *   },
 *   required: ['customerId', 'issue']
 * }
 */
function fieldsToSchema(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { type: 'object', properties: {} };
  }

  const properties = {};
  const required = [];

  for (const field of fields) {
    if (!field || !field.name) continue;
    const key = sanitizeFieldName(field.name);
    if (!key) continue;

    const desc = field.description ? String(field.description).trim() : '';

    switch (field.type) {
      case 'Number':
        properties[key] = { type: 'number', description: desc || `${field.name} numeric value` };
        break;
      case 'Boolean':
        properties[key] = { type: 'boolean', description: desc || `${field.name} boolean flag` };
        break;
      case 'Date':
        properties[key] = { type: 'string', description: desc ? `${desc} (Date YYYY-MM-DD)` : `${field.name} date` };
        break;
      case 'Long text':
        properties[key] = { type: 'string', description: desc ? `${desc} (Long text)` : `${field.name} long text` };
        break;
      case 'Text':
      default:
        properties[key] = { type: 'string', description: desc || `${field.name}` };
        break;
    }

    if (field.required) {
      required.push(key);
    }
  }

  const schema = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Parse an existing JSON Schema object back into field definitions for the UI.
 */
function schemaToFields(schema) {
  if (!schema || typeof schema !== 'object' || !schema.properties) {
    return [];
  }

  const requiredList = Array.isArray(schema.required) ? schema.required : [];
  const fields = [];

  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!prop || typeof prop !== 'object') continue;

    let type = 'Text';
    let desc = prop.description || '';

    if (prop.type === 'number' || prop.type === 'integer') {
      type = 'Number';
    } else if (prop.type === 'boolean') {
      type = 'Boolean';
    } else if (prop.type === 'string') {
      if (desc.includes('(Date') || desc.toLowerCase().includes('date')) {
        type = 'Date';
      } else if (desc.includes('(Long text)') || desc.toLowerCase().includes('complaint') || desc.toLowerCase().includes('instructions') || desc.toLowerCase().includes('purpose') || desc.toLowerCase().includes('question') || desc.toLowerCase().includes('resolution') || desc.toLowerCase().includes('summary') || desc.toLowerCase().includes('issue')) {
        type = 'Long text';
      } else {
        type = 'Text';
      }
    }

    // Clean description marker if present
    const cleanDesc = desc.replace(/\s*\((Date|Long text)[^)]*\)/g, '').trim();

    fields.push({
      name: key,
      description: cleanDesc || desc,
      type,
      required: requiredList.includes(key),
    });
  }

  return fields;
}

/**
 * Normalize and canonize a skill's input/output schema.
 * Accepts either:
 * - An array of field definitions: [{ name, description, type, required }]
 * - An existing JSON Schema object: { type: 'object', properties: {...} }
 * Returns canonical JSON Schema object.
 */
function normalizeToCanonicalSchema(input) {
  if (!input) return { type: 'object', properties: {} };

  if (Array.isArray(input)) {
    const { valid, errors } = validateFieldDefinitions(input);
    if (!valid) {
      throw new Error(`Invalid field definitions: ${errors.join('; ')}`);
    }
    return fieldsToSchema(input);
  }

  if (typeof input === 'object') {
    // If fields array was passed inside object { fields: [...] }
    if (Array.isArray(input.fields)) {
      const { valid, errors } = validateFieldDefinitions(input.fields);
      if (!valid) {
        throw new Error(`Invalid field definitions: ${errors.join('; ')}`);
      }
      return fieldsToSchema(input.fields);
    }

    // Standard JSON Schema object
    if (input.type === 'object' && input.properties) {
      return {
        type: 'object',
        properties: input.properties || {},
        ...(Array.isArray(input.required) && input.required.length > 0 ? { required: input.required } : {}),
      };
    }
  }

  return { type: 'object', properties: {} };
}

module.exports = {
  validateFieldDefinitions,
  sanitizeFieldName,
  fieldsToSchema,
  schemaToFields,
  normalizeToCanonicalSchema,
  ALLOWED_TYPES,
};
