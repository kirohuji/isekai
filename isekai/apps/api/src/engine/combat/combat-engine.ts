// ============================================
// 战斗引擎：自动结算
// ============================================
import type { TurnContext, CombatResult } from '../types'

export class CombatEngine {
  autoResolve(enemy: { name: string; attack: number; defense: number; maxHp: number }, ctx: TurnContext): CombatResult {
    const playerAttack = 10 + (ctx.player.equipment.weapon ? 5 : 0)
    const playerDefense = ctx.player.equipment.armor ? 8 : 3
    const powerRatio = (playerAttack + playerDefense) / (enemy.attack + enemy.defense + 1)
    const winChance = 0.3 + powerRatio * 0.4
    const fleeChance = 0.4
    const roll = Math.random()

    if (roll < fleeChance) {
      return { winner: 'flee', playerHpLost: 2, enemyDefeated: false, narrative: `你判断打不过${enemy.name}，转身跑了。`, duration: 1, spCost: 15 }
    } else if (roll < fleeChance + winChance) {
      const hpLost = Math.max(1, Math.floor(enemy.attack * 0.3 - playerDefense + Math.random() * 5))
      ctx.player.hp = Math.max(0, ctx.player.hp - hpLost)
      const narrativeTemplates = [`你侧身闪过${enemy.name}的扑击，狠狠还击。它倒下了。`, `${enemy.name}被你打退了。`]
      return { winner: 'player', playerHpLost: hpLost, enemyDefeated: true, narrative: narrativeTemplates[Math.floor(Math.random() * narrativeTemplates.length)], duration: 1, spCost: 25 }
    } else {
      const hpLost = Math.max(3, Math.floor(enemy.attack * 0.6))
      ctx.player.hp = Math.max(0, ctx.player.hp - hpLost)
      return { winner: 'enemy', playerHpLost: hpLost, enemyDefeated: false, narrative: `${enemy.name}太强了。你勉强招架了几回合，身上多了${hpLost}处伤口。`, duration: 1, spCost: 25 }
    }
  }
}
