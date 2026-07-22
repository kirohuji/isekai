// ============================================
// 规则系统：效果 (Effect)
// ============================================
import type { TurnContext, Effect, ModifierRequest } from '../types'

export class ModifierEffect implements Effect {
  type = 'modifier'
  constructor(
    private target: string,
    private operation: 'add' | 'multiply' | 'set',
    private value: number,
    private priority: number = 5,
  ) {}
  execute(ctx: TurnContext): void {
    ctx.modifiers.push({ target: this.target, operation: this.operation, value: this.value, priority: this.priority })
  }
}

export class SetFlagEffect implements Effect {
  type = 'setFlag'
  constructor(private name: string, private value: string) {}
  execute(ctx: TurnContext): void {
    ctx.flags.set(this.name, this.value)
  }
}

export class NarrativeEffect implements Effect {
  type = 'narrative'
  constructor(private text: string, private priority: number = 5) {}
  execute(ctx: TurnContext): void {
    ctx.narrativeFragments.push({ text: this.text, priority: this.priority, source: 'rule' })
  }
}

export class TriggerEventEffect implements Effect {
  type = 'triggerEvent'
  constructor(private eventId: number) {}
  execute(ctx: TurnContext): void {
    ctx.pendingEvents.push({ eventId: this.eventId, remainingTurns: 0, sourceTurn: ctx.turn })
  }
}

export class ModifierResolver {
  resolve(modifiers: ModifierRequest[]): Map<string, number> {
    const grouped = new Map<string, ModifierRequest[]>()
    for (const m of modifiers) {
      if (!grouped.has(m.target)) grouped.set(m.target, [])
      grouped.get(m.target)!.push(m)
    }
    const result = new Map<string, number>()
    for (const [target, mods] of grouped) {
      result.set(target, this.resolveOneTarget(mods))
    }
    return result
  }

  private resolveOneTarget(mods: ModifierRequest[]): number {
    const sorted = mods.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    const setOp = sorted.find(m => m.operation === 'set')
    if (setOp) return setOp.value
    const addSum = sorted.filter(m => m.operation === 'add').reduce((s, m) => s + m.value, 0)
    const mulProduct = sorted.filter(m => m.operation === 'multiply').reduce((p, m) => p * m.value, 1)
    return addSum * mulProduct
  }
}
