import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 阶段中文名 */
export const PHASE_NAMES: Record<string, string> = {
  dawn: '黎明', morning: '上午', noon: '正午',
  afternoon: '下午', dusk: '傍晚', night: '夜晚',
};

/** 难度中文名 */
export const DIFFICULTY_NAMES: Record<string, string> = {
  story: '故事模式', survival: '生存模式', doom: '末日模式',
};

/** 难度描述 */
export const DIFFICULTY_DESC: Record<string, string> = {
  story: '资源充裕，适合体验剧情',
  survival: '资源与风险均衡，推荐',
  doom: '资源匮乏，每一步都是生死抉择',
};

/** 人口规模中文名 */
export const POPULATION_NAMES: Record<string, string> = {
  small: '小王国（500万人）',
  medium: '中等王国（1000万人）',
  large: '大王国（2000万人）',
};

/** 行动类别中文 */
export const ACTION_LABELS: Record<string, string> = {
  move: '移动', rest: '休息', work: '打工', explore: '探索',
  socialize: '社交', build: '建设', trade: '交易', combat: '战斗',
  scout: '侦察', hunt: '狩猎', gather: '采集', craft: '制作',
  study: '学习', pray: '祈祷', wait: '等待',
};

/** 行动图标 */
export const ACTION_ICONS: Record<string, string> = {
  move: '🗺️', rest: '😴', work: '💼', explore: '🔍',
  socialize: '💬', build: '🔨', trade: '💰', combat: '⚔️',
  scout: '👁️', hunt: '🏹', gather: '🌿', craft: '🛠️',
  study: '📖', pray: '🙏', wait: '⏳',
};
