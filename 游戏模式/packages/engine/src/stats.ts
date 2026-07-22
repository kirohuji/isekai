import type { CharacterState, StatKey, StatusEffect } from './types.js';
import { clamp } from './config.js';

/** 基础体力恢复（每回合） */
const BASE_STAMINA_REGEN = 3;
/** 基础生命恢复（每回合） */
const BASE_HEALTH_REGEN = 1;
/** 基础精神恢复（每回合） */
const BASE_MENTAL_REGEN = 1;
/** 高饥饿值伤害阈值 */
const HUNGER_DAMAGE_THRESHOLD = 75;
/** 饥饿每回合自然增长 */
const HUNGER_PER_TURN = 2;

/** 对角色施加状态效果 */
export function applyEffect(char: CharacterState, effect: StatusEffect): void {
  const existing = char.statusEffects.find(e => e.type === effect.type);
  if (existing) {
    existing.magnitude = Math.max(existing.magnitude, effect.magnitude);
    existing.remainingTurns = Math.max(existing.remainingTurns, effect.remainingTurns);
  } else {
    char.statusEffects.push({ ...effect });
  }
}

/** 处理角色的自然恢复与消耗 */
export function processStatRegen(char: CharacterState, hungerMultiplier: number): void {
  if (!char.alive) return;

  // 饥饿自然增长
  char.hunger = clamp(char.hunger + HUNGER_PER_TURN * hungerMultiplier, 0, 100);

  // 体力自然恢复（饥饿高时减半）
  const hungerPenalty = char.hunger > 60 ? 0.5 : 1;
  char.stamina = clamp(char.stamina + BASE_STAMINA_REGEN * hungerPenalty, 0, char.maxStamina);

  // 生命自然恢复（只有体力>30且饥饿<70时）
  if (char.stamina > 30 && char.hunger < 70) {
    char.health = clamp(char.health + BASE_HEALTH_REGEN, 0, char.maxHealth);
  }

  // 精神自然恢复
  char.mental = clamp(char.mental + BASE_MENTAL_REGEN, 0, char.maxMental);

  // 饥饿过高导致生命流失
  if (char.hunger >= HUNGER_DAMAGE_THRESHOLD) {
    const hungerDamage = Math.round((char.hunger - HUNGER_DAMAGE_THRESHOLD) / 5);
    char.health = clamp(char.health - hungerDamage, 0, char.maxHealth);
  }

  // 体力归零导致生命流失
  if (char.stamina <= 0) {
    char.health = clamp(char.health - 3, 0, char.maxHealth);
    char.stamina = 0;
  }

  // 处理状态效果
  processStatusEffects(char);
}

/** 处理状态效果 */
function processStatusEffects(char: CharacterState): void {
  char.statusEffects = char.statusEffects.filter(effect => {
    effect.remainingTurns--;

    // 应用效果
    switch (effect.type) {
      case 'injured':
        char.health = clamp(char.health - effect.magnitude, 0, char.maxHealth);
        break;
      case 'sick':
        char.stamina = clamp(char.stamina - effect.magnitude * 2, 0, char.maxStamina);
        break;
      case 'blessed':
        char.health = clamp(char.health + effect.magnitude, 0, char.maxHealth);
        char.mental = clamp(char.mental + effect.magnitude, 0, char.maxMental);
        break;
      case 'cursed':
        char.mental = clamp(char.mental - effect.magnitude * 2, 0, char.maxMental);
        break;
      case 'terrified':
        char.mental = clamp(char.mental - effect.magnitude, 0, char.maxMental);
        break;
      case 'enraged':
        char.combat += effect.magnitude;
        break;
    }

    return effect.remainingTurns > 0;
  });
}

/** 消耗体力执行行动 */
export function consumeStamina(char: CharacterState, amount: number): void {
  char.stamina = clamp(char.stamina - amount, 0, char.maxStamina);
}

/** 消耗饥饿度（进食） */
export function consumeFood(char: CharacterState, foodAmount: number): void {
  // 每单位粮食减少10饥饿度
  char.hunger = clamp(char.hunger - foodAmount * 10, 0, 100);
}

/** 检查角色是否死亡 */
export function checkDeath(char: CharacterState): { dead: boolean; reason: string } {
  if (char.health <= 0) {
    return { dead: true, reason: '生命耗尽' };
  }
  if (char.mental <= 0) {
    const mentalZeroCount = char.statusEffects.filter(e => e.type === 'mental_break').length;
    if (mentalZeroCount >= 3) {
      return { dead: true, reason: '精神崩溃' };
    }
    // 标记精神崩溃
    applyEffect(char, { type: 'mental_break', magnitude: 5, remainingTurns: 1 });
  }
  if (char.hunger >= 100) {
    return { dead: true, reason: '饥饿致死' };
  }
  return { dead: false, reason: '' };
}

/** 获取属性值 */
export function getStat(char: CharacterState, key: StatKey): { current: number; max: number } {
  switch (key) {
    case 'health':  return { current: char.health,  max: char.maxHealth };
    case 'mental':  return { current: char.mental,  max: char.maxMental };
    case 'stamina': return { current: char.stamina, max: char.maxStamina };
    case 'hunger':  return { current: char.hunger,  max: 100 };
  }
}

/** 完全恢复角色（睡觉/使用强效药品） */
export function fullRest(char: CharacterState, multiplier = 1): void {
  char.health = clamp(char.health + 25 * multiplier, 0, char.maxHealth);
  char.mental = clamp(char.mental + 20 * multiplier, 0, char.maxMental);
  char.stamina = clamp(char.stamina + 50 * multiplier, 0, char.maxStamina);
  char.statusEffects = char.statusEffects.filter(e => 
    e.type === 'injured' || e.type === 'sick'
  );
}
