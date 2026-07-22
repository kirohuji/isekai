// ============================================
// NPC Tick：分层处理 NPC 行为
// ============================================
import type { TurnContext } from '../types'
import { npcRepo } from '../../repository'

export class NpcTickSystem {
  tick(ctx: TurnContext): string[] {
    const npcs = npcRepo.getByLocation(ctx.locationId)
    const narratives: string[] = []
    // 只处理同地点的 NPC
    for (const npc of npcs.slice(0, 5)) {  // 最多 5 个
      const action = this.decideNpcAction(npc.occupation ?? 'idle')
      if (action) narratives.push(`${npc.name}${action}`)
    }
    ctx.flags.set('_nearbyNPCs', npcs.map(n => n.name).join('、'))
    return narratives
  }

  private decideNpcAction(occupation: string): string | null {
    switch (occupation) {
      case '猎人': return Math.random() < 0.3 ? '在林子里转了一圈，带回了一只兔子。' : '查看了一下布置的陷阱。'
      case '学者': return Math.random() < 0.5 ? '在角落里写着什么。' : '翻看着一本旧书。'
      case '厨师': return '在厨房里忙碌着。'
      case '商人': return '整理着货架。'
      case '村长': return Math.random() < 0.3 ? '在和村民商量着什么。' : '站在村口张望。'
      case '治疗师': return '在照看伤者。'
      default: return Math.random() < 0.2 ? '四处闲逛着。' : null
    }
  }
}
