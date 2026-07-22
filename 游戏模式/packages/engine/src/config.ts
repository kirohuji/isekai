import type { Difficulty, PopulationScale } from './types.js';
import { DIFFICULTY_CONFIG, POPULATION_SCALES } from './types.js';

/** 伪随机数生成器 */
export function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/** 限制值在范围内 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 从数组中随机取一个元素 */
export function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 按权重随机选择 */
export function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 概率判定 */
export function chance(probability: number, rng: () => number): boolean {
  return rng() < probability;
}

/** 高斯分布的随机数（Box-Muller） */
export function gaussianRandom(rng: () => number, mean = 0, stdDev = 1): number {
  const u1 = rng() || 0.0001;
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/** 获取难度配置 */
export function getDifficultyConfig(d: Difficulty) {
  return DIFFICULTY_CONFIG[d];
}

/** 获取人口规模配置 */
export function getPopulationConfig(p: PopulationScale) {
  return POPULATION_SCALES[p];
}

/** 生成唯一ID */
export function uid(prefix: string, rng: () => number): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(rng() * 10000).toString(36)}`;
}

/** 计算行动成功概率（基于属性+技能） */
export function skillCheck(
  attributeValue: number,
  skillLevel: number,
  difficulty: number,
  rng: () => number,
): { success: boolean; margin: number } {
  const roll = rng() * 20 + attributeValue + skillLevel * 2;
  const margin = roll - difficulty;
  return { success: roll >= difficulty, margin: Math.round(margin) };
}
