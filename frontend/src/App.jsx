import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Dashboard from './pages/Dashboard'
import SkillEditor from './pages/SkillEditor'
import SkillTest from './pages/SkillTest'
import ExecutionDetail from './pages/ExecutionDetail'
import ExecutionsList from './pages/ExecutionsList'
import VersionHistory from './pages/VersionHistory'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/skills/new" element={<SkillEditor />} />
          <Route path="/skills/:id/edit" element={<SkillEditor />} />
          <Route path="/skills/:id/test" element={<SkillTest />} />
          <Route path="/skills/:id/versions" element={<VersionHistory />} />
          <Route path="/executions" element={<ExecutionsList />} />
          <Route path="/executions/:id" element={<ExecutionDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
