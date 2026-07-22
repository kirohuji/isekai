import type { CharacterState, GameEvent } from './types.js';
import { clamp } from './config.js';

/**
 * 自动战斗结算
 * 不做回合制交互，直接计算结果
 */
export interface CombatResult {
  winner: 'attacker' | 'defender' | 'draw';
  attackerHpLost: number;
  defenderHpLost: number;
  attackerAlive: boolean;
  defenderAlive: boolean;
  events: GameEvent[];
}

/**
 * 执行一场自动战斗
 * @param attacker 攻击方
 * @param defender 防御方
 * @param damageMultiplier 伤害倍率（难度相关）
 * @param escapeBonus 逃跑加成（难度相关）
 * @param round 当前回合
 * @param rng 随机函数
 */
export function autoCombat(
  attacker: CharacterState,
  defender: CharacterState,
  damageMultiplier: number,
  escapeBonus: number,
  round: number,
  rng: () => number,
): CombatResult {
  const events: GameEvent[] = [];
  
  // 攻击方战力 = 攻击力 + 敏捷加成 + 随机波动
  const attackerPower = attacker.combat + Math.floor(attacker.agility * 0.5) + Math.floor(rng() * 6);
  // 防御方战力 = 防御力 + 敏捷加成 + 随机波动  
  const defenderPower = defender.defense + Math.floor(defender.agility * 0.5) + Math.floor(rng() * 6);
  
  // 战力差
  const powerDiff = attackerPower - defenderPower;
  
  // 基础伤害
  const baseDamage = Math.max(1, Math.floor((5 + Math.abs(powerDiff)) * damageMultiplier));
  
  let attackerHpLost: number;
  let defenderHpLost: number;
  
  if (powerDiff > 3) {
    // 攻击方明显优势
    attackerHpLost = Math.max(1, Math.floor(baseDamage * (0.2 + rng() * 0.3)));
    defenderHpLost = baseDamage;
  } else if (powerDiff < -3) {
    // 防御方明显优势
    attackerHpLost = baseDamage;
    defenderHpLost = Math.max(1, Math.floor(baseDamage * (0.2 + rng() * 0.3)));
  } else {
    // 势均力敌
    attackerHpLost = Math.floor(baseDamage * (0.4 + rng() * 0.6));
    defenderHpLost = Math.floor(baseDamage * (0.4 + rng() * 0.6));
  }
  
  // 应用伤害
  attacker.health = clamp(attacker.health - attackerHpLost, 0, attacker.maxHealth);
  defender.health = clamp(defender.health - defenderHpLost, 0, defender.maxHealth);
  
  const attackerAlive = attacker.health > 0;
  const defenderAlive = defender.health > 0;
  
  let winner: CombatResult['winner'];
  if (!attackerAlive && !defenderAlive) winner = 'draw';
  else if (!attackerAlive) winner = 'defender';
  else if (!defenderAlive) winner = 'attacker';
  else winner = powerDiff >= 0 ? 'attacker' : 'defender';
  
  // 生成战斗事件
  events.push({
    id: `combat_${attacker.id}_${defender.id}_${round}`,
    type: 'combat.resolved',
    category: 'local',
    actorId: attacker.id,
    targetId: defender.id,
    locationId: attacker.locationId,
    round,
    phase: 'noon',
    day: 0,
    title: `${attacker.name} 与 ${defender.name} 的战斗`,
    description: `${attacker.name}对${defender.name}造成了${defenderHpLost}点伤害，自身受到${attackerHpLost}点伤害。${winner === 'attacker' ? attacker.name + '获胜' : winner === 'defender' ? defender.name + '获胜' : '双方两败俱伤'}`,
    payload: {
      attackerHpLost,
      defenderHpLost,
      attackerPower,
      defenderPower,
      winner,
    },
    causedBy: [],
  });
  
  // 死亡事件
  if (!attackerAlive) {
    events.push({
      id: `death_${attacker.id}_${round}`,
      type: 'character.died',
      category: 'local',
      actorId: attacker.id,
      locationId: attacker.locationId,
      round,
      phase: 'noon',
      day: 0,
      title: `${attacker.name} 战死`,
      description: `${attacker.name}在与${defender.name}的战斗中丧生。`,
      payload: { reason: '战斗死亡', killerId: defender.id },
      causedBy: [],
    });
  }
  if (!defenderAlive) {
    events.push({
      id: `death_${defender.id}_${round}`,
      type: 'character.died',
      category: 'local',
      actorId: defender.id,
      locationId: defender.locationId,
      round,
      phase: 'noon',
      day: 0,
      title: `${defender.name} 战死`,
      description: `${defender.name}在与${attacker.name}的战斗中丧生。`,
      payload: { reason: '战斗死亡', killerId: attacker.id },
      causedBy: [],
    });
  }
  
  return {
    winner,
    attackerHpLost,
    defenderHpLost,
    attackerAlive,
    defenderAlive,
    events,
  };
}

/**
 * 判断两个角色在同一地点是否会发生战斗
 */
export function shouldFight(
  a: CharacterState,
  b: CharacterState,
  rng: () => number,
): boolean {
  if (!a.alive || !b.alive) return false;
  if (a.locationId !== b.locationId) return false;
  if (a.isPlayer === b.isPlayer) return false; // 同阵营不打
  if (a.factionId === b.factionId) return false; // 同势力不打
  
  // 战斗意愿 = 攻击力因素 + 随机
  const aggressor = a.combat > b.combat ? a : b;
  const fightChance = Math.min(0.5, (aggressor.combat - (a.combat === b.combat ? 0 : Math.min(a.combat, b.combat))) * 0.05 + 0.1);
  
  return rng() < fightChance;
}
