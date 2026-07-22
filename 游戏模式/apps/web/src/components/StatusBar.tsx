import { Heart, Zap, Brain, Beef, Shield, Swords, Clock, Sunrise } from 'lucide-react';
import { Progress, Badge } from './ui';
import type { GameResponse } from '../lib/api';
import { cn } from '../lib/utils';

const ALL_PHASES = [
  { key: 'dawn', label: '黎明', icon: '🌅' },
  { key: 'morning', label: '上午', icon: '☀️' },
  { key: 'noon', label: '正午', icon: '🔆' },
  { key: 'afternoon', label: '下午', icon: '🌤️' },
  { key: 'dusk', label: '傍晚', icon: '🌇' },
  { key: 'night', label: '夜晚', icon: '🌙' },
];

interface StatusBarProps {
  player: GameResponse['player'];
  round: number; day: number; phase: string; phaseName: string;
  prevPhase?: string;
}

export function StatusBar({ player, round, day, phase, phaseName, prevPhase }: StatusBarProps) {
  const healthWarn = player.health < 30;
  const staminaWarn = player.stamina < 25;
  const mentalWarn = player.mental < 25;
  const hungerWarn = player.hunger > 70;

  const statBars = [
    {
      icon: <Heart size={13} className={healthWarn ? 'text-red-400' : 'text-rose-400'} />,
      label: '生命', value: player.health, max: player.maxHealth,
      variant: (healthWarn ? 'danger' : 'default') as 'danger' | 'default',
    },
    {
      icon: <Zap size={13} className={staminaWarn ? 'text-red-400' : 'text-amber-400'} />,
      label: '体力', value: player.stamina, max: player.maxStamina,
      variant: (staminaWarn ? 'warning' : 'default') as 'warning' | 'default',
    },
    {
      icon: <Brain size={13} className={mentalWarn ? 'text-red-400' : 'text-violet-400'} />,
      label: '精神', value: player.mental, max: player.maxMental,
      variant: (mentalWarn ? 'danger' : 'default') as 'danger' | 'default',
    },
    {
      icon: <Beef size={13} className={hungerWarn ? 'text-red-400' : 'text-orange-400'} />,
      label: '饥饿', value: player.hunger, max: 100,
      variant: (hungerWarn ? 'danger' : 'warning') as 'danger' | 'warning',
    },
  ];

  return (
    <div className="space-y-3">
      {/* 回合信息 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-widest">回合 {round}</p>
          <p className="text-lg font-serif text-amber-200">
            第 <span className="text-2xl">{day}</span> 天
          </p>
          <p className="text-sm text-amber-300/80">{phaseName}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={player.alive ? 'success' : 'danger'}>
            {player.alive ? '存活' : '死亡'}
          </Badge>
        </div>
      </div>

      {/* 一天时段进度条 */}
      <div className="flex items-center gap-0.5">
        {ALL_PHASES.map((p) => (
          <div
            key={p.key}
            title={p.label}
            className={cn(
              'flex-1 h-7 rounded flex items-center justify-center text-xs transition-all duration-500',
              phase === p.key
                ? 'bg-amber-700 text-amber-100 font-bold scale-110 shadow-md shadow-amber-900/50'
                : ALL_PHASES.findIndex(x => x.key === phase) > ALL_PHASES.findIndex(x => x.key === p.key)
                  ? 'bg-stone-700 text-stone-500'
                  : 'bg-stone-800 text-stone-600'
            )}
          >
            {p.icon}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-stone-600 -mt-1">
        {ALL_PHASES.map(p => (
          <span key={p.key} className={cn(phase === p.key && 'text-amber-400')}>{p.label}</span>
        ))}
      </div>

      {/* 四项属性 */}
      <div className="space-y-2.5">
        {statBars.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-xs text-stone-400">
                {s.icon} {s.label}
              </span>
              <span className="text-xs text-stone-300 tabular-nums">
                {s.value}/{s.max}
              </span>
            </div>
            <Progress value={s.value} max={s.max} variant={s.variant} />
          </div>
        ))}
      </div>

      {/* 战斗属性 */}
      <div className="flex gap-3 text-xs text-stone-500 pt-1 border-t border-amber-800/20">
        <span className="flex items-center gap-1"><Swords size={11} />战力 {player.combat}</span>
        <span className="flex items-center gap-1"><Shield size={11} />防御 {player.defense}</span>
        <span>💰 {player.gold}金币</span>
      </div>

      {/* 死亡警告 */}
      {!player.alive && (
        <div className="mt-3 p-3 rounded-lg bg-red-950/60 border border-red-800/50 text-red-300 text-sm text-center">
          ⚰ 你已经死了。世界仍在继续，但你的故事结束了。
        </div>
      )}
    </div>
  );
}
