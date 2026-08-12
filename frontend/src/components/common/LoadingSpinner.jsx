export function FullPageLoader({ text = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[240px] p-8">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border border-border" />
          <div className="absolute inset-0 rounded-full border-t-2 border-foreground/60 animate-spin" />
        </div>
        <p className="text-xs font-mono text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

export function InlineSpinner({ size = 14 }) {
  return (
    <span
      className="inline-block rounded-full border border-current border-t-transparent animate-spin shrink-0"
      style={{ width: size, height: size, borderWidth: '1.5px' }}
    />
  )
}
