import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Play, History, Brain,
  ChevronLeft, ChevronRight, Zap,
} from 'lucide-react'
import { useState, useEffect } from 'react'

const NAV = [
  { to: '/',           label: 'Dashboard',   icon: LayoutDashboard, description: 'Skills overview' },
  { to: '/skills/new', label: 'New Skill',   icon: Plus,            description: 'Create a workflow' },
  { to: '/executions', label: 'Executions',  icon: Play,            description: 'Run history & logs' },
]

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

function BackendStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${baseUrl}/api/health`, {
          signal: AbortSignal.timeout(3000),
        })
        if (mounted) setStatus(res.ok ? 'connected' : 'offline')
      } catch {
        if (mounted) setStatus('offline')
      }
    }
    check()
    const id = setInterval(check, 6000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono font-semibold',
      status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
      status === 'offline'   ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        status === 'connected' ? 'bg-emerald-400 animate-pulse' :
        status === 'offline'   ? 'bg-rose-400' :
        'bg-amber-400 animate-pulse'
      )} />
      {status === 'connected' ? 'API Online' : status === 'offline' ? 'API Offline' : 'Connecting...'}
    </div>
  )
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()

  return (
    <aside className={cn(
      'sticky top-0 h-screen flex flex-col glass-panel-heavy border-r border-glass transition-all duration-300 z-30 shrink-0',
      collapsed ? 'w-[68px]' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-[70px] border-b border-glass shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
          <Brain className="w-5 h-5 text-foreground/80" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-display font-bold text-foreground text-sm tracking-tight block leading-tight">
              SkillsAgent
            </span>
            <span className="text-[9px] text-muted-foreground font-mono leading-tight block mt-0.5">
              AI Workflow Platform
            </span>
          </div>
        )}
      </div>

      {/* Backend Status */}
      {!collapsed && (
        <div className="px-4 pt-3">
          <BackendStatus />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.map((item, i) => {
          const active = item.to === '/'
            ? pathname === '/'
            : pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? `${item.label} — ${item.description}` : undefined}
              style={{ animationDelay: `${i * 0.05}s` }}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group relative overflow-hidden',
                active
                  ? 'bg-primary/10 text-foreground border border-primary/20'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground border border-transparent'
              )}
            >
              {/* Active left-border accent */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-foreground/60" />
              )}
              <item.icon className={cn(
                'w-[16px] h-[16px] shrink-0 transition-transform duration-200',
                !active && 'group-hover:scale-105'
              )} />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <span className="block leading-tight truncate">{item.label}</span>
                  {!active && (
                    <span className="text-[9px] text-muted-foreground/50 block truncate leading-tight mt-0.5">
                      {item.description}
                    </span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer & Collapse */}
      <div className="border-t border-glass shrink-0">
        {!collapsed && (
          <div className="px-4 py-2 flex items-center gap-2">
            <Zap className="w-3 h-3 text-foreground/30" />
            <span className="text-[10px] font-mono text-muted-foreground/50">Powered by Gemini</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-center w-full h-10 border-t border-glass text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  )
}
