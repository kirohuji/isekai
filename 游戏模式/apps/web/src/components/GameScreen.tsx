import { useState, useCallback } from 'react';
import { StatusBar } from './StatusBar';
import { NarrativePanel } from './NarrativePanel';
import { ActionPanel } from './ActionPanel';
import { TurnAnimation } from './TurnAnimation';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from './ui';
import { api } from '../lib/api';
import { PHASE_NAMES } from '../lib/utils';
import type { GameResponse, ActionItem } from '../lib/api';
import { MapPin, Users, TrendingUp, Skull, Globe } from 'lucide-react';

interface GameScreenProps {
  initial: GameResponse;
  onNewGame: () => void;
}

export function GameScreen({ initial, onNewGame }: GameScreenProps) {
  const [game, setGame] = useState<GameResponse>(initial);
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [error, setError] = useState('');

  const handleAction = useCallback(async (action: ActionItem) => {
    setBusy(true);
    setError('');
    setAnimating(true);
    try {
      const result = await api.act(game.gameId, {
        kind: action.kind,
        targetId: action.targetId,
        label: action.label,
      });
      // 等动画完成再更新状态
      setTimeout(() => {
        setGame(result);
        setAnimating(false);
        setBusy(false);
      }, 3200);
    } catch (e) {
      setError(e instanceof Error ? e.message : '行动执行失败');
      setAnimating(false);
      setBusy(false);
    }
  }, [game.gameId]);

  const phaseName = PHASE_NAMES[game.phase] ?? game.phase;
  const playerDead = !game.player.alive;

  // 检查是否有来自act的actions（更完整）
  const actions = game.actions ?? [];
  
  return (
    <>
      {/* 过场动画 */}
      <TurnAnimation
        isActive={animating}
        onComplete={() => {}}
      />

      <div className="min-h-screen bg-stone-950 text-stone-200">
        {/* 顶部导航 */}
        <header className="sticky top-0 z-30 border-b border-amber-800/30 bg-stone-950/90 backdrop-blur-md px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-serif text-amber-300 tracking-wide">灰丘领主</h1>
              <span className="text-stone-700">|</span>
              <span className="text-sm text-stone-400">{game.player.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={playerDead ? 'danger' : 'success'}>
                {playerDead ? '已死亡' : '存活中'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={onNewGame}>
                新游戏
              </Button>
            </div>
          </div>
        </header>

        {/* 主体 */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/50 text-red-300 text-sm">
              {error}
              <button className="ml-2 underline" onClick={() => setError('')}>关闭</button>
            </div>
          )}

          <div className="grid grid-cols-12 gap-6">
            {/* 左侧栏：状态 */}
            <aside className="col-span-3 space-y-4">
              <Card>
                <CardContent>
                  <StatusBar
                    player={game.player}
                    round={game.round}
                    day={game.day}
                    phase={game.phase}
                    phaseName={phaseName}
                  />
                </CardContent>
              </Card>

              {/* 世界统计 */}
              <Card>
                <CardHeader>
                  <CardTitle>🌐 世界概况</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <StatRow icon={<Users size={13} />} label="核心角色" value={`${game.stats.aliveCore}/${game.stats.totalCore}`} />
                  <StatRow icon={<Globe size={13} />} label="势力" value={`${game.stats.totalFactions}`} />
                  <StatRow icon={<MapPin size={13} />} label="地点" value={`${game.stats.totalLocations}`} />
                  <StatRow icon={<TrendingUp size={13} />} label="稳定度" value={`${game.stats.globalStability}/100`} />
                  <StatRow icon={<Skull size={13} />} label="红月" value={`约${game.redMoonCountdown}天`} />
                </CardContent>
              </Card>

              {/* 附近角色 */}
              {game.nearbyCharacters.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>👥 附近</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {game.nearbyCharacters.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-stone-300">{c.name}</span>
                        <span className="text-stone-600">
                          {c.race} · ⚔{c.combat}
                          {c.isCore && <Badge variant="warning" className="ml-1">★</Badge>}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* 繁忙提示 */}
              {busy && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/30 text-amber-300 text-xs text-center animate-pulse">
                  ⏳ 回合结算中，请等待...
                </div>
              )}
            </aside>

            {/* 中央：叙事 + 行动 */}
            <main className="col-span-9 space-y-5">
              <NarrativePanel
                narrative={game.recentNarrative}
                location={game.location}
              />

              <ActionPanel
                actions={actions}
                onAction={handleAction}
                busy={busy}
                playerDead={playerDead}
              />
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-stone-500">{icon} {label}</span>
      <span className="text-stone-300 tabular-nums">{value}</span>
    </div>
  );
}
