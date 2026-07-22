import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface TurnAnimationProps {
  isActive: boolean;
  onComplete: () => void;
}

/** 回合过场动画：模拟时间流逝 */
export function TurnAnimation({ isActive, onComplete }: TurnAnimationProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    setPhase(0);
    
    // 快速动画：5个阶段，每阶段600ms，总共约3秒
    const timer = setInterval(() => {
      setPhase(p => {
        if (p >= 4) {
          clearInterval(timer);
          setTimeout(onComplete, 300);
          return 4;
        }
        return p + 1;
      });
    }, 600);

    return () => clearInterval(timer);
  }, [isActive, onComplete]);

  if (!isActive) return null;

  const phases = [
    { icon: '⏳', text: '世界在运转...', sub: '所有角色同步行动中' },
    { icon: '🌍', text: '势力在博弈...', sub: '劫掠、交易、扩张' },
    { icon: '⚔️', text: '冲突在发生...', sub: '同地点的角色可能发生战斗' },
    { icon: '📜', text: '因果在编织...', sub: '事件被记录到世界日志' },
    { icon: '✨', text: '新回合准备就绪', sub: '正在生成叙事...' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-center space-y-6">
        {/* 图标 */}
        <div className={cn(
          'text-6xl transition-all duration-500',
          phase < 4 ? 'animate-bounce' : 'scale-110'
        )}>
          {phases[phase].icon}
        </div>

        {/* 文字 */}
        <div>
          <p className={cn(
            'text-2xl font-serif text-amber-200 transition-all duration-500',
            phase === 4 && 'text-emerald-300'
          )}>
            {phases[phase].text}
          </p>
          <p className="text-sm text-stone-500 mt-1">
            {phases[phase].sub}
          </p>
        </div>

        {/* 进度条 */}
        <div className="flex gap-2 justify-center">
          {phases.map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-300',
                i < phase ? 'bg-amber-500 scale-100' :
                i === phase ? 'bg-amber-400 scale-125 animate-pulse' :
                'bg-stone-700'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
