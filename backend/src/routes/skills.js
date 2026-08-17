const express = require('express');
const router = express.Router();
const Skill = require('../models/Skill');
const SkillVersion = require('../models/SkillVersion');
const Execution = require('../models/Execution');
const { validateSkillForPublish } = require('../validators/skillValidator');
const { runAgentLoop } = require('../engine/agentEngine');

const { normalizeToCanonicalSchema } = require('../validators/schemaBuilder');

// GET /api/skills — list all skills with their latest version
router.get('/', async (req, res) => {
  const skills = await Skill.find().sort({ updatedAt: -1 });
  const result = await Promise.all(
    skills.map(async (skill) => {
      const version = await SkillVersion.findOne({ skillId: skill._id }).sort({
        versionNumber: -1,
      });
      return { ...skill.toObject(), latestVersion: version };
    })
  );
  res.json({ skills: result });
});

// POST /api/skills — create a new skill (creates v1 as draft)
router.post('/', async (req, res) => {
  const { name, purpose, inputSchema, outputSchema, inputFields, outputFields, instructions, examples, allowedTools, approvalRequiredActions, maxSteps } = req.body;

  if (!name || !purpose) {
    return res.status(400).json({ error: 'name and purpose are required' });
  }

  const skill = await Skill.create({ name, purpose });

  const canonicalInputSchema = normalizeToCanonicalSchema(inputFields || inputSchema);
  const canonicalOutputSchema = normalizeToCanonicalSchema(outputFields || outputSchema);

  const version = await SkillVersion.create({
    skillId: skill._id,
    versionNumber: 1,
    status: 'draft',
    inputSchema: canonicalInputSchema,
    outputSchema: canonicalOutputSchema,
    instructions: instructions || '',
    examples: examples || [],
    allowedTools: allowedTools || [],
    approvalRequiredActions: approvalRequiredActions || [],
    maxSteps: maxSteps || 10,
  });

  res.status(201).json({ skill, version });
});

// GET /api/skills/:id — get skill with current draft version
router.get('/:id', async (req, res) => {
  const skill = await Skill.findById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const version = await SkillVersion.findOne({ skillId: skill._id }).sort({
    versionNumber: -1,
  });

  res.json({ skill, version });
});

// PUT /api/skills/:id — update skill and its draft version
// If current version is published, creates a new draft
router.put('/:id', async (req, res) => {
  const skill = await Skill.findById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const { name, purpose, inputSchema, outputSchema, inputFields, outputFields, instructions, examples, allowedTools, approvalRequiredActions, maxSteps } = req.body;

  // Update skill metadata
  if (name) skill.name = name;
  if (purpose) skill.purpose = purpose;
  await skill.save();

  // Find the latest version
  const latestVersion = await SkillVersion.findOne({ skillId: skill._id }).sort({
    versionNumber: -1,
  });

  const canonicalInputSchema = (inputFields || inputSchema !== undefined)
    ? normalizeToCanonicalSchema(inputFields || inputSchema)
    : latestVersion?.inputSchema || { type: 'object', properties: {} };

  const canonicalOutputSchema = (outputFields || outputSchema !== undefined)
    ? normalizeToCanonicalSchema(outputFields || outputSchema)
    : latestVersion?.outputSchema || { type: 'object', properties: {} };

  let version;
  if (!latestVersion || latestVersion.status === 'published') {
    // Create a new draft version
    const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    version = await SkillVersion.create({
      skillId: skill._id,
      versionNumber: newVersionNumber,
      status: 'draft',
      inputSchema: canonicalInputSchema,
      outputSchema: canonicalOutputSchema,
      instructions: instructions || latestVersion?.instructions || '',
      examples: examples !== undefined ? examples : latestVersion?.examples || [],
      allowedTools: allowedTools || latestVersion?.allowedTools || [],
      approvalRequiredActions: approvalRequiredActions || latestVersion?.approvalRequiredActions || [],
      maxSteps: maxSteps || latestVersion?.maxSteps || 10,
    });
  } else {
    // Update the existing draft
    if (inputFields !== undefined || inputSchema !== undefined) latestVersion.inputSchema = canonicalInputSchema;
    if (outputFields !== undefined || outputSchema !== undefined) latestVersion.outputSchema = canonicalOutputSchema;
    if (instructions !== undefined) latestVersion.instructions = instructions;
    if (examples !== undefined) latestVersion.examples = examples;
    if (allowedTools !== undefined) latestVersion.allowedTools = allowedTools;
    if (approvalRequiredActions !== undefined) latestVersion.approvalRequiredActions = approvalRequiredActions;
    if (maxSteps !== undefined) latestVersion.maxSteps = maxSteps;
    await latestVersion.save();
    version = latestVersion;
  }

  res.json({ skill, version });
});

// POST /api/skills/:id/validate — validate current draft
router.post('/:id/validate', async (req, res) => {
  const skill = await Skill.findById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const version = await SkillVersion.findOne({
    skillId: skill._id,
    status: 'draft',
  }).sort({ versionNumber: -1 });

  if (!version) {
    return res.status(400).json({ error: 'No draft version found to validate' });
  }

  const { valid, errors } = validateSkillForPublish(version);
  res.json({ valid, errors, versionNumber: version.versionNumber });
});

// POST /api/skills/:id/publish — publish current draft
router.post('/:id/publish', async (req, res) => {
  const skill = await Skill.findById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const version = await SkillVersion.findOne({
    skillId: skill._id,
    status: 'draft',
  }).sort({ versionNumber: -1 });

  if (!version) {
    return res.status(400).json({ error: 'No draft version found to publish' });
  }

  const { valid, errors } = validateSkillForPublish(version);
  if (!valid) {
    return res.status(422).json({ error: 'Skill validation failed', errors });
  }

  version.status = 'published';
  await version.save();

  skill.status = 'published';
  skill.currentVersion = version.versionNumber;
  await skill.save();

  res.json({ skill, version });
});

// GET /api/skills/:id/versions — list all versions
router.get('/:id/versions', async (req, res) => {
  const skill = await Skill.findById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const versions = await SkillVersion.find({ skillId: skill._id }).sort({
    versionNumber: 1,
  });

  res.json({ versions });
});

// GET /api/skills/:id/versions/compare?v1=1&v2=2
router.get('/:id/versions/compare', async (req, res) => {
  const { v1, v2 } = req.query;
  if (!v1 || !v2) {
    return res.status(400).json({ error: 'v1 and v2 query parameters are required' });
  }

  const [version1, version2] = await Promise.all([
    SkillVersion.findOne({ skillId: req.params.id, versionNumber: Number(v1) }),
    SkillVersion.findOne({ skillId: req.params.id, versionNumber: Number(v2) }),
  ]);

  if (!version1) return res.status(404).json({ error: `Version ${v1} not found` });
  if (!version2) return res.status(404).json({ error: `Version ${v2} not found` });

  res.json({ version1, version2 });
});

// GET /api/skills/:id/versions/:vnum — get specific version
router.get('/:id/versions/:vnum', async (req, res) => {
  const version = await SkillVersion.findOne({
    skillId: req.params.id,
    versionNumber: Number(req.params.vnum),
  });

  if (!version) return res.status(404).json({ error: 'Version not found' });
  res.json({ version });
});

// POST /api/skills/:id/execute — start execution
router.post('/:id/execute', async (req, res) => {
  const skill = await Skill.findById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const { input, versionNumber } = req.body;

  // Determine which version to use
  let version;
  if (versionNumber) {
    version = await SkillVersion.findOne({
      skillId: skill._id,
      versionNumber: Number(versionNumber),
    });
    if (!version) {
      return res.status(404).json({ error: `Version ${versionNumber} not found` });
    }
  } else {
    // Use latest published version
    version = await SkillVersion.findOne({
      skillId: skill._id,
      status: 'published',
    }).sort({ versionNumber: -1 });

    if (!version) {
      return res.status(400).json({
        error: 'No published version found. Publish the skill before executing.',
      });
    }
  }

  // Create execution record
  const execution = await Execution.create({
    skillId: skill._id,
    skillVersionId: version._id,
    versionNumber: version.versionNumber,
    input: input || {},
    status: 'RUNNING',
    currentStep: 0,
    steps: [],
  });

  // Run agent loop asynchronously
  // Return execution ID immediately so frontend can start polling
  setImmediate(() => {
    runAgentLoop(execution._id.toString()).catch((err) => {
      console.error('[Execute] Agent loop error:', err);
    });
  });

  res.status(202).json({ execution });
});

module.exports = router;
