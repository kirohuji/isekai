// ============================================
// 内置行动定义 —— 所有注册的行动模板
// ============================================
import type { ActionDef, TurnContext, ActionResult } from '../types'

export const BUILTIN_ACTIONS: ActionDef[] = [
  {
    id: 'ask_priest', name: '向神官询问', category: '社交', icon: '💬',
    requirements: { spCost: 0, locationTags: ['summoning'], forbiddenFlags: ['summoning_briefed'] },
    narrativeTemplate: '你拦住了一名负责登记的灰袍神官。',
    execute(_ctx: TurnContext): ActionResult {
      return {
        narrative: '你追上那名灰袍神官，问这里究竟是什么地方。\n\n“圣光王国，王都。”他没有停下脚步，只把一枚刻着女神徽记的木牌塞给你。“你们被召唤而来，是为应对将至的魔王危机。能力者会接受评估；无能力者领取安置金后自行谋生。不要离开登记区太远。”\n\n他说得像在念一段早已背熟的条文。',
        resourceChanges: [], flagChanges: [{ name: 'summoning_briefed', value: 'true', tier: 'persistent' },
        ],
      }
    },
  },
  {
    id: 'observe_summoned', name: '观察周围的同学', category: '探索', icon: '🔍',
    requirements: { spCost: 0, locationTags: ['summoning'], forbiddenFlags: ['saw_shen_at_summoning'] },
    narrativeTemplate: '你在召唤阵边缘观察同学们的处境。',
    execute(_ctx: TurnContext): ActionResult {
      return {
        narrative: '你在人群里看见熟悉的校服和一张张失措的脸。几名同学被神官带往侧厅，围观者压低声音说他们“有资质”；更多人则和你一样，只拿到一块木牌与一袋银币。\n\n沈清岚站在人群另一端，神情异常平静。她似乎也发现了你，却被一名女祭司挡住了去路。',
        resourceChanges: [], flagChanges: [{ name: 'saw_shen_at_summoning', value: 'true', tier: 'persistent' }],
      }
    },
  },
  {
    id: 'accept_allocation', name: '领取安置金', category: '社交', icon: '◎',
    requirements: { spCost: 0, locationTags: ['summoning'], requiredFlags: ['summoning_briefed'], forbiddenFlags: ['received_settlement_fund'] },
    narrativeTemplate: '你来到发放安置金的桌前。',
    execute(_ctx: TurnContext): ActionResult {
      return {
        narrative: '桌后的书记员核对木牌，推来一个沉甸甸的钱袋。“一百二十银币。离开广场后，你的去向由自己负责。”\n\n钱袋入手的瞬间，你终于意识到：这里没人准备送你回家。',
        resourceChanges: [], flagChanges: [{ name: 'received_settlement_fund', value: 'true', tier: 'persistent' }],
      }
    },
  },
  {
    id: 'rest',
    name: '休息',
    category: 'rest',
    icon: '😴',
    requirements: { spCost: 0 },
    narrativeTemplate: '你找了一处空地坐下来，闭上眼睛歇了一会儿。',
    execute(ctx: TurnContext): ActionResult {
      const hpRecover = Math.min(10, ctx.player.maxHp - ctx.player.hp)
      const spRecover = Math.min(20, ctx.player.maxSp - ctx.player.sp)
      ctx.player.hp += hpRecover
      ctx.player.sp += spRecover
      return {
        narrative: `你休息了一会儿。恢复 ${hpRecover} HP, ${spRecover} SP。`,
        resourceChanges: [
          { target: 'hp', operation: 'add', value: hpRecover },
          { target: 'sp', operation: 'add', value: spRecover },
        ],
        flagChanges: [],
      }
    },
  },
  {
    id: 'explore',
    name: '探索周边',
    category: '探索',
    icon: '🔍',
    requirements: { spCost: 15, minSp: 15, locationTags: ['wild'] },
    narrativeTemplate: '你在周围仔细探查了一番……',
    execute(ctx: TurnContext): ActionResult {
      const roll = Math.random()
      if (roll < 0.3) {
        return { narrative: '你在树丛间发现了一些可用的药草。', resourceChanges: [], flagChanges: [
          { name: 'found_herbs', value: 'true', tier: 'session' },
        ]}
      } else if (roll < 0.5) {
        ctx.player.silver += 3
        return { narrative: '你在地上捡到了几枚铜币——不知道谁掉的。', resourceChanges: [
          { target: 'silver', operation: 'add', value: 3 },
        ], flagChanges: [] }
      }
      return { narrative: '你转了一圈，没发现什么特别的。林间的鸟叫得正欢。', resourceChanges: [], flagChanges: [] }
    },
  },
  {
    id: 'chop_wood',
    name: '砍柴',
    category: '工作',
    icon: '🪓',
    requirements: { spCost: 20, minSp: 30, timeBlocks: ['上午' as any, '下午' as any], locationTags: ['wild'] },
    narrativeTemplate: '你选了一棵枯树，开始劈柴。',
    execute(_ctx: TurnContext): ActionResult {
      return { narrative: '你劈了一大捆干柴。', resourceChanges: [], flagChanges: [
        { name: 'chopped_wood', value: 'true', tier: 'session' },
      ]}
    },
  },
  {
    id: 'talk',
    name: '交谈',
    category: '社交',
    icon: '💬',
    requirements: { spCost: 5, minSp: 5 },
    narrativeTemplate: '你试着和附近的人搭话。',
    execute(ctx: TurnContext): ActionResult {
      const nearbyNames = ctx.flags.get('_nearbyNPCs')
      const narrative = nearbyNames
        ? `你和附近的 ${nearbyNames} 打了声招呼。`
        : '你环顾四周，暂时没有找到愿意交谈的人。'
      return { narrative, resourceChanges: [], flagChanges: [
        { name: 'talked_to_npcs', value: 'true', tier: 'session' },
      ]}
    },
  },
  {
    id: 'move',
    name: '前往下个地点',
    category: '移动',
    icon: '🚶',
    requirements: { spCost: 10, minSp: 10 },
    narrativeTemplate: '你收拾好行装，踏上了路。',
    execute(_ctx: TurnContext): ActionResult {
      return { narrative: '你沿着小路走着。远处的炊烟隐约可见。', resourceChanges: [], flagChanges: [] }
    },
  },
  {
    id: 'eat',
    name: '进食',
    category: 'rest',
    icon: '🍞',
    requirements: { spCost: 5, items: [{ itemId: 'food', minQuantity: 1, consumed: true }] },
    narrativeTemplate: '你拿出干粮啃了起来。',
    execute(ctx: TurnContext): ActionResult {
      const inv = ctx.player.inventory.find(i => i.itemId === 'food')
      if (inv && inv.quantity > 0) {
        inv.quantity--
        ctx.player.sp = Math.min(ctx.player.maxSp, ctx.player.sp + 10)
        return { narrative: '粗糙的干粮此刻也很美味。恢复 10 SP。', resourceChanges: [
          { target: 'sp', operation: 'add', value: 10 },
        ], flagChanges: [] }
      }
      return { narrative: '你没有干粮可吃了。', resourceChanges: [], flagChanges: [] }
    },
  },
]
