// ============================================
// 任务管理器：激活 + 阶段推进 + 奖励
// ============================================
import type { TurnContext, QuestDef, QuestInstance, StageCondition, QuestReward } from '../types'

export class QuestManager {
  private quests = new Map<string, QuestInstance>()

  register(_defs: QuestDef[]): void {}  // 占位

  tick(ctx: TurnContext): void {
    for (const [questId] of this.quests) {
      const state = this.quests.get(questId)!
      if (state.status !== 'active') continue
      // 检查失败条件（简化：超时）
      if (!state.acceptedAtTurn) continue
    }
  }

  activateQuest(questId: string, ctx: TurnContext): void {
    this.quests.set(questId, {
      questId, status: 'active', currentStage: 0,
      stageProgress: {}, acceptedAtTurn: ctx.turn,
    })
    ctx.narrativeFragments.push({ text: `📜 新任务：${questId}`, priority: 7, source: 'quest' })
  }

  completeStage(questId: string, ctx: TurnContext): void {
    const state = this.quests.get(questId)
    if (!state) return
    state.currentStage++
    ctx.narrativeFragments.push({ text: `任务 ${questId} 阶段更新`, priority: 7, source: 'quest' })
  }

  completeQuest(questId: string, ctx: TurnContext): void {
    const state = this.quests.get(questId)
    if (!state) return
    state.status = 'completed'
    ctx.narrativeFragments.push({ text: `✅ 任务完成：${questId}`, priority: 8, source: 'quest' })
  }

  getActive(): QuestInstance[] { return Array.from(this.quests.values()).filter(q => q.status === 'active') }
}
