import { Heart, Zap, Brain, Beef, Shield, Swords } from 'lucide-react';
import { Progress, Badge } from './ui';
import type { GameResponse } from '../lib/api';

interface StatusBarProps {
  player: GameResponse['player'];
  round: number;
  day: number;
  phase: string;
  phaseName: string;
}

export function StatusBar({ player, round, day, phase, phaseName }: StatusBarProps) {
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
          <p className="text-sm text-stone-400">
            第{day}天 · <span className="text-amber-300">{phaseName}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={player.alive ? 'success' : 'danger'}>
            {player.alive ? '存活' : '死亡'}
          </Badge>
        </div>
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
