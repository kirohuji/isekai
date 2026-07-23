import { cn } from '@/lib/utils'

interface GameAction {
  id: string; title: string; description: string
  category: string; reason?: string
}

export function ActionPanel({
  actions,
  onSelect,
  disabled,
}: {
  actions: GameAction[]
  onSelect: (id: string) => void
  disabled: boolean
}) {
  if (actions.length === 0) {
    return (
      <div className="border border-border rounded p-4 text-center text-sm text-muted-foreground">
        暂无可用行动
      </div>
    )
  }

  const icons: Record<string, string> = {
    rest: '😴', 探索: '🔍', 工作: '🪓', 社交: '💬', 移动: '🚶',
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-muted/20 divide-y divide-border">
      <div className="px-4 py-3 text-xs font-medium tracking-[0.16em] text-muted-foreground">
        可选行动
      </div>
      {actions.map((action, i) => (
        <button
          key={i}
          disabled={disabled}
          onClick={() => onSelect(action.id)}
          className={cn(
            'w-full text-left px-4 py-3 text-sm transition-colors',
            'hover:bg-primary/10 active:bg-muted',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'flex items-center gap-2',
          )}
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className="text-base">{icons[action.category] ?? '▶️'}</span>
          <div className="flex-1">
            <span>{action.title}</span>
            {action.description && (
              <span className="text-xs text-muted-foreground ml-2">{action.description}</span>
            )}
          </div>
        </button>
      ))}
    </section>
  )
}
