import { useState } from 'react';
import { Card, CardContent, Button } from './ui';
import { api } from '../lib/api';
import { DIFFICULTY_NAMES, DIFFICULTY_DESC, POPULATION_NAMES } from '../lib/utils';
import type { GameResponse } from '../lib/api';

interface NewGameProps {
  onReady: (game: GameResponse) => void;
}

export function NewGame({ onReady }: NewGameProps) {
  const [name, setName] = useState('未命名旅者');
  const [difficulty, setDifficulty] = useState('survival');
  const [populationScale, setPopulationScale] = useState('small');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setBusy(true);
    setError('');
    try {
      const game = await api.createGame({ name, difficulty, populationScale });
      onReady(game);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建游戏失败');
    } finally {
      setBusy(false);
    }
  };

  const difficulties = ['story', 'survival', 'doom'] as const;
  const popScales = ['small', 'medium', 'large'] as const;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" 
         style={{ background: 'radial-gradient(circle at top, #3a291c 0%, #121310 60%)' }}>
      <Card className="w-full max-w-xl">
        <CardContent className="space-y-6 py-8">
          {/* 标题 */}
          <div className="text-center space-y-2">
            <p className="text-xs text-amber-600 uppercase tracking-[0.2em]">异世界 · 同步回合制生存</p>
            <h1 className="text-4xl font-serif text-amber-200 tracking-wide">灰丘领主</h1>
            <p className="text-sm text-stone-500 leading-relaxed">
              每个人都在同一时间行动。<br/>
              你的选择是因，世界日志是果。
            </p>
          </div>

          {/* 角色名 */}
          <div>
            <label className="block text-xs text-stone-400 mb-1.5">角色名</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={24}
              className="w-full px-4 py-2.5 rounded-lg bg-stone-950 border border-amber-800/40 text-stone-200 
                         placeholder-stone-600 focus:outline-none focus:border-amber-600 transition-colors text-sm"
              placeholder="输入你的名字..."
            />
          </div>

          {/* 难度选择 */}
          <div>
            <label className="block text-xs text-stone-400 mb-2">难度</label>
            <div className="grid grid-cols-3 gap-2">
              {difficulties.map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    difficulty === d
                      ? 'border-amber-600 bg-amber-950/40 text-amber-200'
                      : 'border-stone-800 bg-stone-900/50 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <p className="text-sm font-medium">{DIFFICULTY_NAMES[d]}</p>
                  <p className="text-xs mt-0.5 opacity-70">{DIFFICULTY_DESC[d]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 人口规模 */}
          <div>
            <label className="block text-xs text-stone-400 mb-2">人口规模（影响地图大小与NPC密度）</label>
            <div className="grid grid-cols-3 gap-2">
              {popScales.map(p => (
                <button
                  key={p}
                  onClick={() => setPopulationScale(p)}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    populationScale === p
                      ? 'border-amber-600 bg-amber-950/40 text-amber-200'
                      : 'border-stone-800 bg-stone-900/50 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <p className="text-sm font-medium">{POPULATION_NAMES[p]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 错误 */}
          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950/40 rounded-lg p-2">{error}</p>
          )}

          {/* 创建按钮 */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleCreate}
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> 正在生成世界...
              </span>
            ) : (
              '✨ 开始世界'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
