import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface TurnAnimationProps {
  isActive: boolean;
  day: number;
  newDay: number;
  phaseLabel: string;
  onComplete: () => void;
}

const STEPS = [
  { icon: '⏳', text: '计时流逝...' },
  { icon: '🌍', text: '势力博弈...' },
  { icon: '⚔️', text: '冲突结算...' },
  { icon: '📜', text: '因果编织...' },
  { icon: '✨', text: '新状态就绪' },
];

export function TurnAnimation({ isActive, day, newDay, phaseLabel, onComplete }: TurnAnimationProps) {
  const [step, setStep] = useState(0);
  const dayChanged = newDay > day;

  useEffect(() => {
    if (!isActive) return;
    setStep(0);
    const timer = setInterval(() => {
      setStep(p => {
        if (p >= STEPS.length - 1) {
          clearInterval(timer);
          setTimeout(onComplete, 400);
          return p;
        }
        return p + 1;
      });
    }, 550);
    return () => clearInterval(timer);
  }, [isActive, onComplete]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="text-center space-y-5 max-w-sm">
        {/* 图标 */}
        <div className={cn('text-6xl transition-all duration-500', step < STEPS.length - 1 ? 'animate-bounce' : 'scale-110')}>
          {STEPS[step].icon}
        </div>

        {/* 主文本 */}
        <p className={cn('text-2xl font-serif transition-all duration-500', step === STEPS.length - 1 ? 'text-emerald-300' : 'text-amber-200')}>
          {STEPS[step].text}
        </p>

        {/* 时间变化指示 */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-900/80 border border-amber-800/30">
          <span className="text-stone-500">第{day}天</span>
          <span className="text-amber-400">→</span>
          <span className={cn('text-lg font-bold', dayChanged ? 'text-amber-300' : 'text-stone-300')}>
            第{newDay}天
          </span>
          <span className="text-stone-600 mx-1">|</span>
          <span className="text-sm text-amber-300">{phaseLabel}</span>
        </div>

        {/* 跨天提醒 */}
        {dayChanged && (
          <p className="text-amber-400/80 text-sm animate-pulse">
            🌅 新的一天开始了！每日消耗已结算。
          </p>
        )}

        {/* 进度点 */}
        <div className="flex gap-2 justify-center">
          {STEPS.map((_, i) => (
            <div key={i} className={cn('w-2 h-2 rounded-full transition-all duration-300',
              i < step ? 'bg-amber-500' : i === step ? 'bg-amber-400 scale-125 animate-pulse' : 'bg-stone-700'
            )} />
          ))}
        </div>
      </div>
    </div>
  );
}