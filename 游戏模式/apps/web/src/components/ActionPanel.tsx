import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from './ui';
import { ACTION_ICONS, ACTION_LABELS, cn } from '../lib/utils';
import type { ActionItem } from '../lib/api';

interface ActionPanelProps {
  actions: ActionItem[];
  onAction: (action: ActionItem) => void;
  busy: boolean;
  playerDead: boolean;
}

export function ActionPanel({ actions, onAction, busy, playerDead }: ActionPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('全部');

  // 分类
  const categories = ['全部', ...new Set(actions.map(a => a.category))];
  const filtered = activeCategory === '全部' ? actions : actions.filter(a => a.category === activeCategory);

  return (
    <Card>
      <CardHeader>
        <CardTitle>⚡ 可选行动</CardTitle>
        {playerDead && (
          <p className="text-xs text-red-400 mt-2">你已经死亡，无法执行任何行动。</p>
        )}
      </CardHeader>
      <CardContent>
        {/* 分类标签 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-amber-800 text-amber-100'
                  : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 行动列表 */}
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="text-stone-600 text-sm text-center py-4">此分类下暂无可用行动</p>
          )}
          {filtered.map((action, i) => (
            <button
              key={`${action.kind}_${action.targetId ?? ''}_${i}`}
              onClick={() => !busy && !playerDead && onAction(action)}
              disabled={busy || playerDead}
              className={cn(
                'w-full text-left p-3 rounded-lg transition-all duration-150',
                'border border-transparent',
                'hover:border-amber-700/40 hover:bg-stone-800/60',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'group flex items-start gap-3'
              )}
            >
              <span className="text-lg mt-0.5 flex-shrink-0">
                {ACTION_ICONS[action.kind] ?? '❓'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-200 group-hover:text-amber-200 transition-colors">
                  {action.label}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {action.cost}
                </p>
              </div>
              <Badge variant="default" className="flex-shrink-0 text-[10px]">
                {ACTION_LABELS[action.kind] ?? action.kind}
              </Badge>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
