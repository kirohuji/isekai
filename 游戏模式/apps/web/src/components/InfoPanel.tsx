import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from './ui';
import { cn } from '../lib/utils';
import { api, type CharacterDetail, type GameResponse } from '../lib/api';
import { Users, Building2, Briefcase, ChevronDown, ChevronRight, X, Heart, Zap, Brain, Beef } from 'lucide-react';

interface InfoPanelProps {
  gameId: string;
  nearbyCharacters: GameResponse['nearbyCharacters'];
  party?: GameResponse['party'];
  assets?: GameResponse['assets'];
  employments?: GameResponse['employments'];
  onRefresh: () => void;
}

export function InfoPanel({ gameId, nearbyCharacters, party, assets, employments, onRefresh }: InfoPanelProps) {
  const [tab, setTab] = useState<'party' | 'assets' | 'nearby'>('party');
  const [selectedChar, setSelectedChar] = useState<CharacterDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openCharDetail = async (charId: string) => {
    setLoadingDetail(true);
    try { setSelectedChar(await api.getCharacter(gameId, charId)); }
    catch { /* ignore */ }
    finally { setLoadingDetail(false); }
  };

  const handlePartyLeave = async (charId: string) => {
    await api.partyLeave(gameId, charId);
    onRefresh();
  };

  const handleEmploy = async (charId: string) => {
    await api.employ(gameId, charId, '员工', 5);
    onRefresh();
  };

  const partyIds = new Set((party ?? []).map(p => p.character_id));
  const empIds = new Set((employments ?? []).map(e => e.employee_id));

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>📋 管理</CardTitle>
            <div className="flex gap-1">
              {(['party', 'assets', 'nearby'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={cn('px-2 py-0.5 rounded text-xs', tab === t ? 'bg-amber-800 text-amber-100' : 'bg-stone-800 text-stone-400')}>
                  {t === 'party' ? `👥 队伍(${party?.length ?? 0})` : t === 'assets' ? `🏠 资产(${assets?.length ?? 0})` : `📍 附近(${nearbyCharacters.length})`}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 队伍 */}
          {tab === 'party' && (
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {(!party || party.length === 0) && <p className="text-xs text-stone-600 py-2">队伍中还没有成员。</p>}
              {(party ?? []).map(p => {
                const emp = (employments ?? []).find(e => e.employee_id === p.character_id);
                return (
                  <div key={p.character_id} className="flex items-center justify-between p-2 rounded-lg bg-stone-800/50 hover:bg-stone-800 cursor-pointer group" onClick={() => openCharDetail(p.character_id)}>
                    <div>
                      <span className="text-sm text-stone-200">{p.character_name}</span>
                      <span className="text-xs text-stone-500 ml-2">{p.role}</span>
                      {emp && <span className="text-xs text-amber-500 ml-1">💰{emp.salary}/日</span>}
                    </div>
                    <button className="text-xs text-stone-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); handlePartyLeave(p.character_id); }}>
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 资产 */}
          {tab === 'assets' && (
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {(!assets || assets.length === 0) && <p className="text-xs text-stone-600 py-2">暂无资产。购买旅馆、土地等后将显示在此处。</p>}
              {(assets ?? []).map(a => (
                <div key={a.asset_id} className="p-2 rounded-lg bg-stone-800/50 text-sm">
                  <div className="flex justify-between">
                    <span className="text-stone-200">{a.name}</span>
                    <span className={cn('text-xs', a.daily_income > 0 ? 'text-emerald-400' : 'text-stone-500')}>
                      {a.daily_income > 0 ? `+${a.daily_income}` : a.daily_income}G/日
                    </span>
                  </div>
                  {a.description && <p className="text-xs text-stone-500 mt-0.5">{a.description}</p>}
                  <div className="flex gap-3 mt-1 text-[10px] text-stone-600">
                    <span>维护{a.daily_upkeep}G</span>
                    <span>价值{a.value}G</span>
                  </div>
                </div>
              ))}
              {assets && assets.length > 0 && (
                <div className="pt-1 text-xs text-right text-emerald-400">
                  每日净收入：{assets.reduce((s, a) => s + (a.is_active ? a.daily_income - a.daily_upkeep : 0), 0)}G
                </div>
              )}
            </div>
          )}

          {/* 附近 */}
          {tab === 'nearby' && (
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {nearbyCharacters.length === 0 && <p className="text-xs text-stone-600 py-2">附近没有其他人。</p>}
              {nearbyCharacters.map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-stone-800/50 hover:bg-stone-800 cursor-pointer group" onClick={() => openCharDetail(c.id)}>
                  <div>
                    <span className="text-sm text-stone-200">{c.name}</span>
                    <span className="text-xs text-stone-500 ml-2">{c.race}</span>
                    {c.isCore && <Badge variant="warning" className="ml-1 text-[10px]">★</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {!partyIds.has(c.id) && <button className="text-[10px] text-amber-500 hover:text-amber-300" onClick={e => { e.stopPropagation(); handleEmploy(c.id); }}>雇佣</button>}
                    {partyIds.has(c.id) && <span className="text-[10px] text-stone-600">已在队伍</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 角色详情弹窗 */}
      {selectedChar && <CharDetailModal char={selectedChar} loading={loadingDetail} onClose={() => setSelectedChar(null)} />}
    </>
  );
}

/** 角色详情弹窗 */
function CharDetailModal({ char, loading, onClose }: { char: CharacterDetail; loading: boolean; onClose: () => void }) {
  if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}><div className="text-amber-300 animate-pulse">加载中...</div></div>;

  const statBars: [string, number, number, string, React.ReactNode][] = [
    ['生命', char.stats.health, char.stats.maxHealth, 'text-rose-400', <Heart size={12} />],
    ['体力', char.stats.stamina, char.stats.maxStamina, 'text-amber-400', <Zap size={12} />],
    ['精神', char.stats.mental, char.stats.maxMental, 'text-violet-400', <Brain size={12} />],
    ['饥饿', char.stats.hunger, 100, 'text-orange-400', <Beef size={12} />],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-stone-900 border border-amber-800/40 rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-serif text-amber-200">{char.name}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300"><X size={18} /></button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex gap-2 flex-wrap">
            <Badge>{char.race}</Badge>
            <Badge variant={char.alive ? 'success' : 'danger'}>{char.alive ? '存活' : '死亡'}</Badge>
            {char.isCore && <Badge variant="warning">★ 核心</Badge>}
            {char.party && <Badge variant="default">👥 {char.party.role}</Badge>}
          </div>

          {/* 属性条 */}
          <div className="space-y-1.5">
            {statBars.map(([label, val, max, color, icon]) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="flex items-center gap-1 text-stone-400">{icon}{label}</span>
                  <span className="text-stone-300">{val}/{max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-800 overflow-hidden">
                  <div className={cn('h-full rounded-full', val / max < 0.3 ? 'bg-red-500' : 'bg-amber-600')} style={{ width: `${Math.min(100, val / max * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* 战斗属性 */}
          <div className="flex gap-3 text-xs text-stone-500 border-t border-stone-800 pt-2">
            <span>⚔战力{char.combat.combat}</span>
            <span>🛡防御{char.combat.defense}</span>
            <span>💨敏捷{char.combat.agility}</span>
            <span>💰{char.gold}G</span>
          </div>

          {/* 属性 */}
          {char.attributes && (
            <div className="border-t border-stone-800 pt-2">
              <p className="text-xs text-stone-500 mb-1">属性</p>
              <div className="grid grid-cols-5 gap-1 text-center text-xs">
                {Object.entries(char.attributes).map(([k, v]) => (
                  <div key={k} className="bg-stone-800/50 rounded py-1">
                    <p className="text-stone-500">{k === 'insight' ? '洞察' : k === 'composure' ? '冷静' : k === 'tenacity' ? '坚韧' : k === 'charisma' ? '魅力' : '智谋'}</p>
                    <p className="text-stone-200">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 技能 */}
          {char.skills && char.skills.length > 0 && (
            <div className="border-t border-stone-800 pt-2">
              <p className="text-xs text-stone-500 mb-1">技能</p>
              {char.skills.map(s => (
                <div key={s.name} className="flex justify-between text-xs">
                  <span className="text-stone-300">{s.name}</span>
                  <span className="text-stone-500">Lv{s.level}</span>
                </div>
              ))}
            </div>
          )}

          {/* 工作信息 */}
          {char.employment && (
            <div className="border-t border-stone-800 pt-2 text-xs">
              <p className="text-stone-300">💼 {char.employment.role}</p>
              <p className="text-stone-500">工资{char.employment.salary}G/日 · 忠诚度{char.employment.loyalty}/100</p>
            </div>
          )}

          {/* 位置 */}
          {char.location && (
            <div className="border-t border-stone-800 pt-2 text-xs text-stone-500">
              📍 {char.location.name} · {char.location.region}
              {char.faction && <span> · 🏛 {char.faction.name}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
