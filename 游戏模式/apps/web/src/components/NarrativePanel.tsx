import { Card, CardContent, Badge } from './ui';
import type { GameResponse } from '../lib/api';

interface NarrativePanelProps {
  narrative: { body: string; mood: string } | null;
  location: GameResponse['location'];
}

export function NarrativePanel({ narrative, location }: NarrativePanelProps) {
  const moodColors: Record<string, string> = {
    grim: 'border-red-900/40',
    hopeful: 'border-emerald-900/40',
    tense: 'border-amber-900/40',
    calm: 'border-blue-900/40',
    mysterious: 'border-violet-900/40',
    survival: 'border-amber-800/40',
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
