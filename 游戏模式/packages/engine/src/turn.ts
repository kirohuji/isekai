import type { WorldState, GameEvent, Intent, NpcDecision, Difficulty, NarrativeHint, CharacterState } from './types.js';
import { createRng, chance } from './config.js';
import { processStatRegen, consumeStamina, checkDeath } from './stats.js';
import { generateNpcIntents, resolveFactionActions } from './population.js';
import { autoCombat, shouldFight } from './combat.js';
import { ACTION_COST, PHASES, DIFFICULTY_CONFIG, DEATH_THRESHOLDS } from './types.js';
import type { TurnResolution, DeathRecord, FactionAction } from './types.js';
import { clamp } from './config.js';
import { processRules } from './rules.js';

/**
 * 回合结算引擎 · 核心
 * 
 * 处理流程：
 * 1. 接收玩家意图 + AI为NPC生成的决策
 * 2. 按行动顺序执行所有角色行动
 * 3. 处理同地点战斗
 * 4. 处理势力群体行动
 * 5. 处理每日/每回合消耗与恢复
 * 6. 检查死亡
 * 7. 生成事件与叙事提示
 * 8. 处理规则引擎（条件→效果）
 */
export function resolveTurn(
  world: WorldState,
  playerIntent: Intent,
  npcDecisions: NpcDecision[],
  aiAssistedCount: number, // AI协助决策的核心角色数量
): TurnResolution {
  const rng = createRng(world.seed + world.round * 137);
  const diff = DIFFICULTY_CONFIG[world.difficulty];
  const events: GameEvent[] = [];
  const deaths: DeathRecord[] = [];
  const narrativeHints: NarrativeHint[] = [];

  // 深拷贝状态
  const state: WorldState = structuredClone(world);
  const charMap = new Map(state.characters.map(c => [c.id, c]));
  const locMap = new Map(state.locations.map(l => [l.id, l]));

  // ==========================================
  // 阶段1：收集所有意图
  // ==========================================
  const allIntents: Intent[] = [playerIntent];
  
  // NPC决策：一半AI指导，一半随机
  const randomNpcIntents = generateNpcIntents(
    state.characters.filter(c => c.alive && !c.isPlayer && 
      !npcDecisions.some(d => d.characterId === c.id)),
    rng,
  );
  
  for (const nd of npcDecisions) {
    allIntents.push(nd.intent);
  }
  for (const ri of randomNpcIntents) {
    allIntents.push({
      actorId: ri.characterId,
      kind: ri.kind as Intent['kind'],
      targetId: ri.targetId,
      label: ri.label,
    });
  }

  // 按敏捷排序（决定行动顺序）
  const sortedIntents = allIntents.sort((a, b) => {
    const charA = charMap.get(a.actorId);
    const charB = charMap.get(b.actorId);
    return (charB?.agility ?? 5) - (charA?.agility ?? 5);
  });

  // ==========================================
  // 阶段2：执行所有行动
  // ==========================================
  for (const intent of sortedIntents) {
    const actor = charMap.get(intent.actorId);
    if (!actor || !actor.alive) continue;

    const cost = ACTION_COST[intent.kind] ?? ACTION_COST.wait;

    // 消耗体力
    if (cost.stamina > 0) {
      consumeStamina(actor, cost.stamina);
    } else {
      // 休息恢复体力
      actor.stamina = clamp(actor.stamina - cost.stamina, 0, actor.maxStamina);
    }

    // 消耗饥饿
    actor.hunger = clamp(actor.hunger + cost.hunger * diff.hungerRate, 0, 100);

    // 根据行动类型处理
    switch (intent.kind) {
      case 'move': {
        if (intent.targetId && locMap.has(intent.targetId)) {
          const oldLoc = actor.locationId;
          actor.locationId = intent.targetId;
          events.push(makeEvent('actor.moved', 'local', actor.id, world.round, world.phase, world.day, {
            from: oldLoc,
            to: intent.targetId,
          }, `${actor.name} 前往了 ${locMap.get(intent.targetId)?.name}`, []));
        }
        break;
      }
      case 'rest': {
        actor.health = clamp(actor.health + 5, 0, actor.maxHealth);
        actor.mental = clamp(actor.mental + 3, 0, actor.maxMental);
        actor.stamina = clamp(actor.stamina + 15, 0, actor.maxStamina);
        events.push(makeEvent('action.rest', 'private', actor.id, world.round, world.phase, world.day, {
          recovered: { health: 5, mental: 3, stamina: 15 },
        }, `${actor.name} 休息了一会儿`, []));
        break;
      }
      case 'explore': {
        // 探索可能发现物品
        if (chance(0.25, rng)) {
          const items = ['可食用根茎', '药草', '生锈的工具', '铜币', '旧布料', '奇怪的石头'];
          const item = items[Math.floor(rng() * items.length)];
          events.push(makeEvent('explore.discovery', 'local', actor.id, world.round, world.phase, world.day, {
            item,
            quantity: Math.floor(rng() * 3) + 1,
          }, `${actor.name} 发现了 ${item}`, []));
        }
        break;
      }
      case 'work': {
        const earned = Math.floor((5 + rng() * 15) * (actor.attributes.cunning + 1) * 0.5);
        actor.gold += earned;
        events.push(makeEvent('action.work', 'private', actor.id, world.round, world.phase, world.day, {
          earned,
        }, `${actor.name} 通过打工赚取了 ${earned} 金币`, []));
        break;
      }
      case 'hunt': {
        if (chance(0.4 + actor.attributes.insight * 0.05, rng)) {
          const food = Math.floor(rng() * 3) + 1;
          events.push(makeEvent('action.hunt_success', 'local', actor.id, world.round, world.phase, world.day, {
            food,
          }, `${actor.name} 狩猎成功，获得 ${food} 单位粮食`, []));
          // 为所在势力增加粮食
          const faction = state.factions.find(f => f.id === actor.factionId);
          if (faction) faction.food += food * 100; // 缩放
        }
        break;
      }
      case 'trade': {
        if (chance(0.6, rng)) {
          const profit = Math.floor(rng() * 30) - 10;
          actor.gold = Math.max(0, actor.gold + profit);
        }
        break;
      }
    }
  }

  // ==========================================
  // 阶段3：同地点战斗检测
  // ==========================================
  const locationGroups = new Map<string, CharacterState[]>();
  for (const char of state.characters.filter(c => c.alive)) {
    const group = locationGroups.get(char.locationId) || [];
    group.push(char);
    locationGroups.set(char.locationId, group);
  }

  for (const [, chars] of locationGroups) {
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        if (shouldFight(chars[i], chars[j], rng)) {
          const result = autoCombat(chars[i], chars[j], diff.damageMult, diff.escapeBonus, world.round, rng);
          events.push(...result.events);
          
          // 检查死亡
          if (!result.attackerAlive) {
            chars[i].alive = false;
            deaths.push({
              characterId: chars[i].id,
              name: chars[i].name,
              reason: '战斗死亡',
              locationId: chars[i].locationId,
              round: world.round,
            });
          }
          if (!result.defenderAlive) {
            chars[j].alive = false;
            deaths.push({
              characterId: chars[j].id,
              name: chars[j].name,
              reason: '战斗死亡',
              locationId: chars[j].locationId,
              round: world.round,
            });
          }
        }
      }
    }
  }

  // ==========================================
  // 阶段4：势力群体行动（统计层面）
  // ==========================================
  const factionActions: FactionAction[] = resolveFactionActions(state.factions, rng);
  
  // 将势力行动转化为世界事件
  for (const fa of factionActions) {
    const faction = state.factions.find(f => f.id === fa.factionId);
    if (!faction) continue;
    events.push(makeEvent('faction.action', 'world', undefined, world.round, world.phase, world.day, {
      factionId: fa.factionId,
      factionName: faction.name,
      actionType: fa.actionType,
      ...fa.result,
    }, `${faction.name} 进行了 ${fa.actionType} 行动`, []));
  }

  // ==========================================
  // 阶段5：每日/每回合消耗
  // ==========================================
  // 推进时段
  const currentPhaseIdx = PHASES.indexOf(state.phase);
  const nextPhaseIdx = (currentPhaseIdx + 1) % PHASES.length;
  const crossedDay = state.phase === 'night';
  
  state.phase = PHASES[nextPhaseIdx];
  state.round += 1;

  if (crossedDay) {
    state.day += 1;
    state.redMoonCountdown = Math.max(0, state.redMoonCountdown - 1);
    
    // 每日粮食消耗
    const aliveChars = state.characters.filter(c => c.alive && c.isPlayer).length || 1;
    state.globalFood = Math.max(0, state.globalFood - aliveChars);
    
    // 未进食惩罚
    if (state.globalFood <= 0) {
      for (const char of state.characters.filter(c => c.alive && c.isPlayer)) {
        char.hunger = clamp(char.hunger + 18 * diff.hungerRate, 0, 100);
      }
      events.push(makeEvent('day.starvation', 'public', undefined, world.round, world.phase, world.day, {
        foodRemaining: 0,
      }, '粮食耗尽！所有人陷入饥饿。', []));
    } else {
      // 进食减少饥饿
      for (const char of state.characters.filter(c => c.alive && c.isPlayer)) {
        char.hunger = clamp(char.hunger - 10, 0, 100);
      }
    }
    
    // 每日自然恢复与消耗
    for (const char of state.characters.filter(c => c.alive)) {
      processStatRegen(char, diff.hungerRate);
    }
    
    events.push(makeEvent('day.settled', 'public', undefined, world.round, world.phase, world.day, {
      day: state.day,
      food: state.globalFood,
      redMoonCountdown: state.redMoonCountdown,
    }, `第 ${state.day} 天结束`, []));
  }

  // 每回合对所有活着的角色做自然恢复
  for (const char of state.characters.filter(c => c.alive && !c.isPlayer)) {
    processStatRegen(char, diff.hungerRate);
  }

  // ==========================================
  // 阶段6：死亡检查
  // ==========================================
  for (const char of state.characters) {
    if (!char.alive) continue;
    const { dead, reason } = checkDeath(char);
    if (dead) {
      char.alive = false;
      deaths.push({
        characterId: char.id,
        name: char.name,
        reason,
        locationId: char.locationId,
        round: world.round,
      });
      events.push(makeEvent('character.died', 'public', char.id, world.round, world.phase, world.day, {
        reason,
        locationId: char.locationId,
      }, `${char.name} 因 ${reason} 死亡`, []));
    }
  }

  // ==========================================
  // 阶段7：生成叙事提示
  // ==========================================
  const playerEvents = events.filter(e => 
    e.actorId === state.playerId || 
    e.targetId === state.playerId ||
    e.category === 'public' ||
    e.category === 'world'
  );

  // 从玩家事件中构建叙事提示
  for (const event of playerEvents) {
    narrativeHints.push({
      viewpoint: state.playerId,
      category: mapEventToCategory(event.type),
      priority: event.category === 'public' ? 5 : event.actorId === state.playerId ? 8 : 3,
      facts: [event.description],
      mood: inferMood(event.type),
      relatedCharacters: [event.actorId, event.targetId].filter(Boolean) as string[],
      relatedLocations: [event.locationId].filter(Boolean) as string[],
    });
  }

  // 全局态势提示
  narrativeHints.push({
    viewpoint: state.playerId,
    category: 'world_event',
    priority: 2,
    facts: [
      `当前回合: ${state.round}`,
      `日期: 第${state.day}天 · ${state.phase}`,
      `存活的核心角色: ${state.characters.filter(c => c.alive && c.isCore).length}/${state.characters.filter(c => c.isCore).length}`,
    ],
    mood: state.globalFood <= 0 ? 'desperate' : 'survival',
    relatedCharacters: [],
    relatedLocations: [],
  });

  // 阶段8：规则引擎 + 天气衰减
  if (state.weather.remainingRounds > 0) {
    state.weather.remainingRounds--;
    if (state.weather.remainingRounds <= 0) {
      state.weather = { type: 'clear', intensity: 1, description: '天空放晴', remainingRounds: 0 };
    }
  }
  const ruleEvents = processRules(state);
  events.push(...ruleEvents);

  return {
    state,
    events,
    playerEvents: [...playerEvents, ...ruleEvents.filter(e => e.category === 'world' || e.actorId === state.playerId)],
    factionActions,
    deaths,
    narrativeHints,
  };
}

// ============================================================
// 辅助
// ============================================================

function makeEvent(
  type: string,
  category: GameEvent['category'],
  actorId: string | undefined,
  round: number,
  phase: string,
  day: number,
  payload: Record<string, unknown>,
  description: string,
  causedBy: string[],
): GameEvent {
  return {
    id: `evt_${type}_${round}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    category,
    actorId,
    round,
    phase: phase as GameEvent['phase'],
    day,
    title: description.slice(0, 50),
    description,
    payload,
    causedBy,
  };
}

function mapEventToCategory(type: string): NarrativeHint['category'] {
  if (type.startsWith('combat')) return 'combat';
  if (type.startsWith('explore')) return 'discovery';
  if (type.startsWith('character.died')) return 'character_event';
  if (type.startsWith('faction') || type.startsWith('day') || type.startsWith('world')) return 'world_event';
  return 'action_result';
}

function inferMood(type: string): string {
  if (type.includes('died') || type.includes('starvation')) return 'grim';
  if (type.includes('discovery') || type.includes('success') || type.includes('earned')) return 'hopeful';
  if (type.includes('combat')) return 'tense';
  if (type.includes('rest')) return 'calm';
  return 'neutral';
}
