// ============================================
// 经济系统：价格计算
// ============================================
import type { TurnContext } from '../types'
import { itemRepo } from '../../repository'

export class EconomySystem {
  getPrice(itemId: string, merchantPriceModifier: number, ctx: TurnContext): { buyPrice: number; sellPrice: number } {
    const item = itemRepo.getById(Number(itemId)) ?? itemRepo.getAll().find(i => i.name === itemId)
    if (!item) return { buyPrice: 10, sellPrice: 5 }
    let buyPrice = item.baseBuyPrice * merchantPriceModifier
    // 声望修正
    const rep = ctx.player.reputations.get('苇水村') ?? 0
    if (rep >= 30) buyPrice = Math.floor(buyPrice * 0.9)
    if (rep >= 60) buyPrice = Math.floor(buyPrice * 0.8)
    // 技能修正
    const skill = ctx.player.skills.find(s => s.skillId === 'negotiation')
    if (skill) buyPrice = Math.floor(buyPrice * (1 - skill.level * 0.05))
    return { buyPrice: Math.max(1, buyPrice), sellPrice: Math.max(1, Math.floor(buyPrice * 0.6)) }
  }
}
