import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Badge } from './ui';
import { ACTION_ICONS, ACTION_LABELS, cn } from '../lib/utils';
import type { RegularAction, DynamicAction } from '../lib/api';

interface ActionPanelProps {
  regularActions: RegularAction[];
  dynamicActions: DynamicAction[];
  onAction: (action: { kind: string; targetId?: string; label: string; detail?: string }) => void;
  busy: boolean;
  playerDead: boolean;
}

export function ActionPanel({ regularActions, dynamicActions, onAction, busy, playerDead }: ActionPanelProps) {
  const [tab, setTab] = useState<'regular' | 'ai'>('regular');
  const [activeCategory, setActiveCategory] = useState('全部');

  const categories = ['全部', ...new Set(regularActions.map(a => a.category))];
  const filteredRegular = activeCategory === '全部' ? regularActions : regularActions.filter(a => a.category === activeCategory);
  const showDynamic = tab === 'ai' && dynamicActions.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>⚡ 可选行动</CardTitle>
          {dynamicActions.length > 0 && (
            <div className="flex gap-1">
              <button onClick={() => setTab('regular')} className={cn('px-2 py-0.5 rounded text-xs', tab === 'regular' ? 'bg-amber-800 text-amber-100' : 'bg-stone-800 text-stone-400')}>
                常规
              </button>
              <button onClick={() => setTab('ai')} className={cn('px-2 py-0.5 rounded text-xs', tab === 'ai' ? 'bg-violet-800 text-violet-100' : 'bg-stone-800 text-stone-400')}>
                🤖 AI建议
              </button>
            </div>
          )}
        </div>
        {playerDead && <p className="text-xs text-red-400 mt-2">你已经死亡，无法执行任何行动。</p>}
      </CardHeader>
      <CardContent>
        {/* AI动态行动 */}
        {showDynamic && (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            <p className="text-xs text-violet-400/70 mb-2 italic">AI根据你的数值、性格和周围环境生成的行动建议：</p>
            {dynamicActions.map((a, i) => (
              <button
                key={`ai_${i}`}
                onClick={() => !busy && !playerDead && onAction({ kind: a.kind, targetId: a.targetId, label: a.label, detail: a.detail })}
                disabled={busy || playerDead}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-all duration-150',
                  'border border-violet-800/30 hover:border-violet-600/50 hover:bg-violet-950/30',
                  'disabled:opacity-40 disabled:cursor-not-allowed', 'group flex items-start gap-3'
                )}
              >
                <span className="text-lg mt-0.5">🤖</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-200 group-hover:text-violet-200 transition-colors">{a.label}</p>
                  {a.detail && <p className="text-xs text-stone-500 mt-0.5">{a.detail}</p>}
                </div>
                <Badge variant="default" className="text-[10px] bg-violet-900/60 text-violet-300">AI</Badge>
              </button>
            ))}
          </div>
        )}

        {/* 常规行动 */}
        {tab === 'regular' && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', activeCategory === cat ? 'bg-amber-800 text-amber-100' : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200')}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {filteredRegular.length === 0 && <p className="text-stone-600 text-sm text-center py-4">此分类下暂无可用行动</p>}
              {filteredRegular.map((action, i) => (
                <button key={`${action.kind}_${action.targetId ?? ''}_${i}`} onClick={() => !busy && !playerDead && onAction({ kind: action.kind, targetId: action.targetId, label: action.label })} disabled={busy || playerDead} className={cn('w-full text-left p-3 rounded-lg transition-all duration-150', 'border border-transparent', 'hover:border-amber-700/40 hover:bg-stone-800/60', 'disabled:opacity-40 disabled:cursor-not-allowed', 'group flex items-start gap-3')}>
                  <span className="text-lg mt-0.5 flex-shrink-0">{ACTION_ICONS[action.kind] ?? '❓'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-200 group-hover:text-amber-200 transition-colors">{action.label}</p>
                    <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-2">
                      <span className={`flex items-center gap-0.5 ${action.cost.phases >= 2 ? 'text-amber-400 font-medium' : ''}`}>
                        ⏱️ {action.cost.phases}时段
                      </span>
                      <span className={`flex items-center gap-0.5 ${action.cost.stamina >= 12 ? 'text-red-400' : action.cost.stamina < 0 ? 'text-emerald-400' : 'text-stone-500'}`}>
                        ⚡ {action.cost.stamina < 0 ? `+${Math.abs(action.cost.stamina)}` : `-${action.cost.stamina}`}
                      </span>
                      <span className={`flex items-center gap-0.5 ${action.cost.hunger >= 4 ? 'text-orange-400' : 'text-stone-500'}`}>
                        🍖 +{action.cost.hunger}
                      </span>
                    </p>
                  </div>
                  <Badge variant="default" className="flex-shrink-0 text-[10px]">{ACTION_LABELS[action.kind] ?? action.kind}</Badge>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
