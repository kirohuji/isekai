import { Card, CardContent, Badge } from './ui';
import type { GameResponse } from '../lib/api';

interface NarrativePanelProps {
  narrative: { body: string; mood: string } | null;
  location: GameResponse['location'];
  worldReview?: GameResponse['worldReview'];
}

export function NarrativePanel({ narrative, location, worldReview }: NarrativePanelProps) {
  const moodColors: Record<string, string> = {
    grim: 'border-red-900/40', hopeful: 'border-emerald-900/40',
    tense: 'border-amber-900/40', calm: 'border-blue-900/40',
    mysterious: 'border-violet-900/40', survival: 'border-amber-800/40',
  };
  const moodBorder = narrative?.mood ? moodColors[narrative.mood] ?? moodColors.survival : moodColors.survival;

  return (
    <Card className={moodBorder}>
      <CardContent>
        {/* 地点信息 */}
        {location && (
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-amber-800/20">
            <span className="text-lg">📍</span>
            <div>
              <p className="text-amber-200 font-serif text-base">{location.name}</p>
              <p className="text-xs text-stone-500">{location.region} · {location.isSafe ? '安全区域' : '⚠ 危险区域'} · 约{location.population}人</p>
            </div>
          </div>
        )}

        {/* 世界回顾（每5回合） */}
        {worldReview && (
          <div className="mb-4 p-4 rounded-lg border border-violet-800/40 bg-violet-950/20 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🌐</span>
              <span className="text-sm font-serif text-violet-300">{worldReview.title}</span>
              <Badge variant="default" className="ml-auto text-[10px] bg-violet-900/60 text-violet-300">
                每5回合回顾
              </Badge>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex gap-2">
                <span className="text-violet-500 w-12 flex-shrink-0">🔗 因果</span>
                <span className="text-stone-400">{worldReview.causalChain}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-violet-500 w-12 flex-shrink-0">🦋 蝴蝶</span>
                <span className="text-stone-400">{worldReview.butterflyEffect}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-violet-500 w-12 flex-shrink-0">📈 趋势</span>
                <span className="text-stone-400">{worldReview.worldTrend}</span>
              </div>
              <div className="flex gap-2 pt-1 border-t border-violet-800/30">
                <span className="text-amber-400 w-12 flex-shrink-0">💡</span>
                <span className="text-amber-300/80 italic">{worldReview.playerAdvice}</span>
              </div>
            </div>
          </div>
        )}

        {/* 叙事文本 */}
        {narrative ? (
          <div className="prose prose-invert prose-amber max-w-none">
            <div className="text-stone-300 leading-relaxed whitespace-pre-line text-sm">
              {narrative.body}
            </div>
          </div>
        ) : (
          <p className="text-stone-600 text-sm italic">世界正在生成中...</p>
        )}

        {/* 气氛指示 */}
        {narrative?.mood && (
          <div className="mt-3 text-right">
            <Badge variant={
              narrative.mood === 'grim' ? 'danger' : 
              narrative.mood === 'hopeful' ? 'success' : 
              'default'
            }>
              {narrative.mood === 'grim' ? '🌑 压抑' :
               narrative.mood === 'hopeful' ? '✨ 希望' :
               narrative.mood === 'tense' ? '⚡ 紧张' :
               narrative.mood === 'mysterious' ? '🔮 神秘' :
               '🏕️ 生存'}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
