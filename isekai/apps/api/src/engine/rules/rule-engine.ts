// ============================================
// 规则引擎 —— 收集规则，评估条件，执行效果
// ============================================
import type { Rule, RuleBindable, TurnContext, ModifierRequest } from '../types'
import { ModifierResolver } from './effects'

export class RuleEngine {
  private resolver = new ModifierResolver()

  evaluateAll(ctx: TurnContext, objects: RuleBindable[]): RuleEvalResult {
    const sorted = objects
      .flatMap(obj => obj.rules.map(r => ({ rule: r, source: obj })))
      .sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0))

    for (const { rule } of sorted) {
      if (rule.condition.evaluate(ctx)) {
        for (const effect of rule.effects) {
          effect.execute(ctx)
        }
      }
    }

    const resolvedModifiers = this.resolver.resolve(ctx.modifiers)

    return {
      modifiers: ctx.modifiers,
      resolved: resolvedModifiers,
      narrativeFragments: ctx.narrativeFragments,
      pendingEvents: ctx.pendingEvents,
    }
  }
}

export interface RuleEvalResult {
  modifiers: ModifierRequest[]
  resolved: Map<string, number>
  narrativeFragments: any[]
  pendingEvents: any[]
}
