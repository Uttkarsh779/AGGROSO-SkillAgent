import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// ─── Skills ──────────────────────────────────────────────────────────────────
export const getSkills = () => api.get('/skills').then(r => r.data)
export const getSkill = (id) => api.get(`/skills/${id}`).then(r => r.data)
export const createSkill = (data) => api.post('/skills', data).then(r => r.data)
export const updateSkill = (id, data) => api.put(`/skills/${id}`, data).then(r => r.data)
export const validateSkill = (id) => api.post(`/skills/${id}/validate`).then(r => r.data)
export const publishSkill = (id) => api.post(`/skills/${id}/publish`).then(r => r.data)
export const executeSkill = (id, data) => api.post(`/skills/${id}/execute`, data).then(r => r.data)

// ─── Versions ────────────────────────────────────────────────────────────────
export const getVersions = (skillId) => api.get(`/skills/${skillId}/versions`).then(r => r.data)
export const getVersion = (skillId, vnum) => api.get(`/skills/${skillId}/versions/${vnum}`).then(r => r.data)
export const compareVersions = (skillId, v1, v2) =>
  api.get(`/skills/${skillId}/versions/compare?v1=${v1}&v2=${v2}`).then(r => r.data)

// ─── Executions ──────────────────────────────────────────────────────────────
export const getExecutions = (params) => api.get('/executions', { params }).then(r => r.data)
export const getExecution = (id) => api.get(`/executions/${id}`).then(r => r.data)
export const cancelExecution = (id) => api.post(`/executions/${id}/cancel`).then(r => r.data)
export const getExecutionApprovals = (id) => api.get(`/executions/${id}/approvals`).then(r => r.data)

// ─── Approvals ────────────────────────────────────────────────────────────────
export const approveAction = (id) => api.post(`/approvals/${id}/approve`).then(r => r.data)
export const rejectAction = (id) => api.post(`/approvals/${id}/reject`).then(r => r.data)

// ─── Health ──────────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/health').then(r => r.data)

export default api
