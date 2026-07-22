import { cn } from '@/lib/utils'

/** 行动面板 — 显示可选操作列表 */
export function ActionPanel({
  actions,
  onSelect,
  disabled,
}: {
  actions: string[]
  onSelect: (index: number) => void
  disabled: boolean
}) {
  if (actions.length === 0) {
    return (
      <div className="border border-border rounded p-4 text-center text-sm text-muted-foreground">
        暂无可用行动
      </div>
    )
  }

  return (
    <div className="border border-border rounded divide-y divide-border">
      <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">
        📋 可选行动
      </div>
      {actions.map((action, i) => (
        <button
          key={i}
          disabled={disabled}
          onClick={() => onSelect(i + 1)}
          className={cn(
            'w-full text-left px-3 py-2 text-sm transition-colors',
            'hover:bg-muted/50 active:bg-muted',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'animate-slide-up',
          )}
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className="text-primary mr-2">{i + 1}.</span>
          {action}
        </button>
      ))}
    </div>
  )
}
