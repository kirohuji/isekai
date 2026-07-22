// ============================================================
// 规则引擎 —— 条件评估 & 效果应用 & 因果链追踪
// ============================================================

import type { WorldState, Rule, RuleCondition, RuleEffect, GameEvent, CharacterState, Location, InventoryItem, Quest, QuestObjective, QuestReward, Weather } from './types.js';
import { createRng, clamp } from './config.js';

/**
 * 评估单条规则的所有条件是否满足
 */
export function evaluateRule(rule: Rule, world: WorldState, actor?: CharacterState): boolean {
  if (!rule.isActive) return false;
  const location = actor ? world.locations.find(l => l.id === actor.locationId) : undefined;
  
  for (const cond of rule.conditions) {
    if (!evaluateCondition(cond, world, actor, location)) return false;
  }
  return true;
}

/**
 * 评估单个条件
 */
function evaluateCondition(cond: RuleCondition, world: WorldState, actor?: CharacterState, location?: Location): boolean {
  const p = cond.params;

  switch (cond.type) {
    case 'stat_check': {
      if (!actor) return false;
      const stat = p['stat'] as string;
      const op = p['op'] as string;
      const value = p['value'] as number;
      const current = (actor as unknown as Record<string, number>)[stat] ?? 0;
      switch (op) {
        case 'lt': return current < value;
        case 'gt': return current > value;
        case 'lte': return current <= value;
        case 'gte': return current >= value;
        default: return false;
      }
    }
    case 'location_has': {
      if (!location) return false;
      const feature = p['feature'] as string;
      const features = inferLocationFeatures(location);
      return features.includes(feature);
    }
    case 'location_type': {
      if (!location) return false;
      return inferLocationType(location) === (p['type'] as string);
    }
    case 'phase_is': return world.phase === (p['phase'] as string);
    case 'weather_is': return world.weather.type === (p['weather'] as string);
    case 'has_item': {
      const itemType = p['itemType'] as string;
      return world.inventory.some(i => i.itemType === itemType && i.quantity > 0);
    }
    case 'has_status': {
      if (!actor) return false;
      return actor.statusEffects.some(e => e.type === (p['statusType'] as string));
    }
    case 'has_asset': return world.assets.some(a => a.assetType === (p['assetType'] as string) && a.isActive);
    case 'has_relation': {
      const withCharId = p['withCharId'] as string | undefined;
      const minAff = p['minAffection'] as number | undefined;
      if (!withCharId) return false;
      const rel = world.relationships.find(r => 
        (r.characterA === actor?.id && r.characterB === withCharId) ||
        (r.characterB === actor?.id && r.characterA === withCharId)
      );
      if (!rel) return minAff === undefined || minAff <= 0;
      if (minAff !== undefined && rel.affection < minAff) return false;
      return true;
    }
    case 'has_slave': return world.slaves.some(s => s.slaveType === (p['slaveType'] as string));
    case 'flag_check': {
      return world.gameId === world.gameId; // simplified
    }
    case 'random_chance': return createRng(world.seed + world.round)( ) < (p['probability'] as number);
    case 'every_n_rounds': return world.round % (p['interval'] as number) === 0;
    case 'day_changed': return true; // caller checks this
    case 'phase_changed': return true; // caller checks this
    case 'npc_nearby': {
      const minCount = p['minCount'] as number ?? 1;
      if (!location) return false;
      const nearby = world.characters.filter(c => c.alive && c.locationId === location.id && c.id !== actor?.id);
      return nearby.length >= minCount;
    }
    case 'player_did': {
      return true; // caller checks this
    }
    default: return false;
  }
}

/**
 * 应用规则效果到世界状态
 */
export function applyRuleEffects(rule: Rule, world: WorldState, actor?: CharacterState): GameEvent[] {
  const events: GameEvent[] = [];

  for (const effect of rule.effects) {
    const evt = applyEffect(effect, world, rule, actor);
    if (evt) events.push(evt);
  }

  // 消耗持续时间
  if (rule.duration > 0) {
    rule.duration--;
    if (rule.duration <= 0) {
      rule.isActive = false;
      events.push({
        id: `rule_expire_${rule.id}`,
        type: 'rule.expired',
        category: 'world',
        round: world.round, phase: world.phase, day: world.day,
        title: `${rule.name} 效果结束`,
        description: `${rule.description} 不再生效。`,
        payload: { ruleId: rule.id },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      });
    }
  }

  return events;
}

/**
 * 应用单个效果
 */
function applyEffect(effect: RuleEffect, world: WorldState, rule: Rule, actor?: CharacterState): GameEvent | null {
  const p = effect.params;

  switch (effect.type) {
    case 'stat_mod': {
      const stat = p['stat'] as string;
      const delta = p['delta'] as number;
      const target = actor ?? world.characters.find(c => c.id === world.playerId);
      if (!target) return null;
      const t = target as unknown as Record<string, number>;
      t[stat] = clamp(t[stat] + delta, 0, 100);
      return null; // stat mods are silent
    }
    case 'add_status': {
      if (!actor) return null;
      const statusType = p['statusType'] as string;
      const magnitude = p['magnitude'] as number ?? 3;
      const duration = p['duration'] as number ?? 5;
      actor.statusEffects.push({ type: statusType, magnitude, remainingTurns: duration });
      return {
        id: `eff_${rule.id}_${statusType}`,
        type: 'status.applied', category: 'local', actorId: actor.id,
        round: world.round, phase: world.phase, day: world.day,
        title: `${actor.name} 获得状态: ${statusType}`,
        description: `因${rule.name}，${actor.name}获得${statusType}效果`,
        payload: { statusType, magnitude, duration, ruleId: rule.id },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      };
    }
    case 'remove_status': {
      if (!actor) return null;
      const statusType = p['statusType'] as string;
      actor.statusEffects = actor.statusEffects.filter(e => e.type !== statusType);
      return null;
    }
    case 'trigger_event': {
      return {
        id: `evt_${rule.id}_${world.round}`,
        type: 'event.triggered', category: 'world',
        round: world.round, phase: world.phase, day: world.day,
        title: rule.name,
        description: rule.description,
        payload: { eventId: p['eventId'], ruleId: rule.id },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      };
    }
    case 'modify_relation': {
      const charA = p['charA'] as string;
      const charB = p['charB'] as string;
      const affDelta = p['affectionDelta'] as number ?? 0;
      const trustDelta = p['trustDelta'] as number ?? 0;
      const existing = world.relationships.find(r =>
        (r.characterA === charA && r.characterB === charB) || (r.characterA === charB && r.characterB === charA)
      );
      if (existing) {
        existing.affection = clamp(existing.affection + affDelta, -100, 100);
        existing.trust = clamp(existing.trust + trustDelta, 0, 100);
      } else {
        world.relationships.push({
          characterA: charA, characterB: charB,
          affection: affDelta, trust: trustDelta,
          status: '陌生人', lastInteractionRound: world.round,
        });
      }
      return null;
    }
    case 'weather_change': {
      const newWeather = p['newWeather'] as Weather['type'];
      const intensity = p['intensity'] as number ?? 3;
      const duration = p['duration'] as number ?? 6;
      world.weather = { type: newWeather, intensity, description: '', remainingRounds: duration };
      return {
        id: `weather_${world.round}`,
        type: 'weather.changed', category: 'world',
        round: world.round, phase: world.phase, day: world.day,
        title: `天气变化: ${newWeather}`,
        description: `天气变为${newWeather}，持续约${duration}回合`,
        payload: { weather: newWeather, intensity, duration },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      };
    }
    case 'narrative_hint': {
      return {
        id: `hint_${rule.id}_${world.round}`,
        type: 'narrative.hint', category: 'private', actorId: actor?.id,
        round: world.round, phase: world.phase, day: world.day,
        title: p['topic'] as string ?? '',
        description: '',
        payload: { topic: p['topic'], mood: p['mood'], ruleId: rule.id },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      };
    }
    case 'daily_income_mod': {
      const delta = p['delta'] as number ?? 0;
      const player = world.characters.find(c => c.id === world.playerId);
      if (player) player.gold += delta;
      return null;
    }
    case 'give_item': {
      const name = p['itemName'] as string;
      const itemType = p['itemType'] as string ?? 'misc';
      const quantity = p['quantity'] as number ?? 1;
      const value = p['value'] as number ?? 0;
      world.inventory.push({
        id: `item_${world.round}_${world.inventory.length}`,
        name, itemType: itemType as InventoryItem['itemType'], quantity,
        description: '', value, isEquipped: false,
      });
      return {
        id: `item_${world.round}`,
        type: 'item.acquired', category: 'local', actorId: actor?.id,
        round: world.round, phase: world.phase, day: world.day,
        title: `获得: ${name} x${quantity}`,
        description: `因${rule.name}获得${name}`,
        payload: { itemName: name, quantity, ruleId: rule.id },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      };
    }
    case 'add_quest': {
      const qId = p['questId'] as string;
      if (world.quests.some(q => q.id === qId)) return null;
      world.quests.push({
        id: qId,
        name: p['name'] as string,
        description: p['description'] as string ?? '',
        category: (p['category'] as Quest['category']) ?? 'side',
        status: 'active',
        objectives: (p['objectives'] as QuestObjective[]) ?? [],
        rewards: (p['rewards'] as QuestReward) ?? {},
        acquiredRound: world.round,
      });
      return {
        id: `quest_${qId}`,
        type: 'quest.started', category: 'local', actorId: actor?.id,
        round: world.round, phase: world.phase, day: world.day,
        title: `新任务: ${p['name']}`,
        description: p['description'] as string ?? '',
        payload: { questId: qId },
        causedBy: rule.causalParent ? [rule.causalParent] : [],
      };
    }
    case 'update_quest': {
      const qId = p['questId'] as string;
      const oId = p['objectiveId'] as string;
      const progress = p['progress'] as number ?? 1;
      const quest = world.quests.find(q => q.id === qId);
      if (!quest) return null;
      const obj = quest.objectives.find(o => o.id === oId);
      if (!obj) return null;
      obj.current = Math.min(obj.required, obj.current + progress);
      if (obj.current >= obj.required) obj.isCompleted = true;
      if (quest.objectives.every(o => o.isCompleted)) quest.status = 'completed';
      return null;
    }
    default: return null;
  }
}

/**
 * 处理世界回合：评估所有活跃规则，应用效果，生成事件
 */
export function processRules(world: WorldState, triggerFilter?: string): GameEvent[] {
  const events: GameEvent[] = [];

  for (const rule of world.rules.filter(r => r.isActive)) {
    if (triggerFilter && !rule.conditions.some(c => c.type === triggerFilter)) continue;
    if (evaluateRule(rule, world)) {
      const evts = applyRuleEffects(rule, world);
      events.push(...evts);
    }
  }

  // 清理已过期规则
  world.rules = world.rules.filter(r => r.isActive);

  return events;
}

// ---- 辅助 ----

export function inferLocationType(loc?: Location): string {
  if (!loc) return 'any';
  const id = loc.id;
  if (id.includes('market') || id.includes('inn') || id.includes('gate') || id.includes('square') || id.includes('temple') || id.includes('cathedral')) return 'town';
  if (id.includes('marsh') || id.includes('deep') || id.includes('road') || id.includes('wall') || id.includes('edge')) return 'wild';
  if (id.includes('village') || id.includes('reed') || id.includes('hill')) return 'village';
  if (id.includes('city') || id.includes('capital')) return 'city';
  return 'border';
}

export function inferLocationFeatures(loc?: Location): string[] {
  if (!loc) return [];
  const f: string[] = [];
  const name = loc.name + loc.id;
  if (loc.isSafe) f.push('shelter');
  if (name.includes('旅馆') || name.includes('客栈') || name.includes('inn')) { f.push('bed'); f.push('tavern'); }
  if (name.includes('神殿') || name.includes('圣殿') || name.includes('修道院') || name.includes('temple') || name.includes('cathedral')) f.push('temple');
  if (name.includes('集市') || name.includes('市场') || name.includes('market')) f.push('market');
  if (name.includes('沼泽') || name.includes('marsh') || name.includes('河') || name.includes('water')) f.push('water');
  return f;
}
