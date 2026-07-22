// ============================================
// 角色系统：状态效果 + 性格演变 + 心理状态
// ============================================
import type { TurnContext, StatusEffectInstance, PersonalityProfile, PsychologicalState } from '../types'

export class CharacterSystem {
  /** 每回合 tick——状态效果推进，性格不变 */
  tickStatusEffects(ctx: TurnContext): void {
    for (const se of ctx.player.statusEffects) {
      se.elapsed++
      // 到期自动移除
      if (se.duration > 0 && se.elapsed >= se.duration) {
        ctx.narrativeFragments.push({ text: `[${se.name}] 效果已消退。`, priority: 2, source: 'status' })
        ctx.player.statusEffects = ctx.player.statusEffects.filter(s => s !== se)
        continue
      }
      // 每回合 tick 效果
      if (se.modifiers) {
        for (const m of se.modifiers) {
          const p = ctx.player as any
          if (m.operation === 'add') p[m.target] = (p[m.target] ?? 0) + m.value
          else if (m.operation === 'multiply') p[m.target] = Math.floor((p[m.target] ?? 0) * m.value)
        }
      }
    }
  }

  /** 添加状态 */
  addStatus(ctx: TurnContext, se: StatusEffectInstance): void {
    ctx.player.statusEffects.push(se)
    ctx.narrativeFragments.push({ text: `你获得了 [${se.name}] 状态。`, priority: 6, source: 'status' })
  }

  /** 移除状态 */
  removeStatus(ctx: TurnContext, statusId: string): void {
    ctx.player.statusEffects = ctx.player.statusEffects.filter(s => s.id !== statusId)
  }
}

// ─── 内置状态工厂 ───
export const STATUS_TEMPLATES = {
  lightWound: (): StatusEffectInstance => ({
    id: 'light_wound', name: '轻伤', type: 'injury', duration: 10, elapsed: 0,
    modifiers: [{ target: 'hp', operation: 'add', value: -2 }],
  }),
  heavyWound: (): StatusEffectInstance => ({
    id: 'heavy_wound', name: '重伤', type: 'injury', duration: 30, elapsed: 0,
    modifiers: [{ target: 'hp', operation: 'add', value: -5 }, { target: 'sp', operation: 'multiply', value: 0.5 }],
    blockActions: ['chop_wood', 'explore'],
  }),
  hungry: (): StatusEffectInstance => ({
    id: 'hungry', name: '饥饿', type: 'condition', duration: -1, elapsed: 0,
    modifiers: [{ target: 'hp', operation: 'add', value: -3 }],
  }),
  poisoned: (): StatusEffectInstance => ({
    id: 'poisoned', name: '中毒', type: 'debuff', duration: 15, elapsed: 0,
    modifiers: [{ target: 'hp', operation: 'add', value: -5 }, { target: 'mp', operation: 'add', value: -3 }],
  }),
  inspired: (): StatusEffectInstance => ({
    id: 'inspired', name: '鼓舞', type: 'buff', duration: 8, elapsed: 0,
    modifiers: [{ target: 'sp', operation: 'add', value: 10 }],
  }),
  fear: (): StatusEffectInstance => ({
    id: 'fear', name: '恐惧', type: 'condition', duration: 10, elapsed: 0,
    blockActions: ['explore'],
    unlockActions: ['talk'],
  }),
}

// ─── 性格演变 ───
export class PersonalityEvolution {
  shift(ctx: TurnContext, trait: keyof PersonalityProfile, delta: number): void {
    ctx.player.personality[trait] = Math.max(0, Math.min(100, ctx.player.personality[trait] + delta))
  }
}

// ─── 心理状态 ───
export class PsychologySystem {
  setState(ctx: TurnContext, state: string, source?: string): void {
    ctx.player.psychology = {
      current: state,
      sourceEvent: source,
      duration: state === '正常' ? 0 : 20,
      elapsed: 0,
      triggers: [],
    }
    ctx.narrativeFragments.push({ text: `你的心理状态变为: ${state}`, priority: 5, source: 'psychology' })
  }

  tick(ctx: TurnContext): void {
    const psycho = ctx.player.psychology
    if (psycho.current === '正常') return
    psycho.elapsed++
    if (psycho.duration > 0 && psycho.elapsed >= psycho.duration) {
      this.setState(ctx, '正常')
    }
  }
}
