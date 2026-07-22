// ============================================
// CSV 数据层类型 —— 从 CSV 解析后的中间表示
// ============================================

/** CSV 规则定义（加载时用，运行时会编译为 Rule） */
export interface RuleDef {
  id: string
  name: string
  bindType: string       // weather | location | item | skill | personality | psychology | status | season | npc
  bindId: string         // 绑定目标 ID
  conditionType: string  // timeBlock | actionCategory | weather | season | operator
  conditionParams: any   // 条件参数（可能是字符串或已解析的 JSON）
  effectType: string     // multiply | add | set | block | unlock | allow | negate | setFlag
  effectParams: any      // 效果参数（可能是字符串或已解析的 JSON）
  priority: number
  description: string
}

/** CSV 任务定义（扁平结构，与嵌套的 QuestDef 不同） */
export interface QuestDefFlat {
  id: string
  name: string
  description: string
  category: string
  isMain: boolean
  isAbandonable: boolean
  timeoutTurns: number
  activationFlag: string
  stage1Name: string; stage1Desc: string; stage1Cond: string
  stage2Name: string; stage2Desc: string; stage2Cond: string
  stage3Name: string; stage3Desc: string; stage3Cond: string
  rewards: string        // 逗号分隔的奖励字符串
}

/** CSV 对话话题定义 */
export interface DialogueTopicDef {
  npcId: number
  topicId: string
  topicLabel: string
  topicCategory: string   // daily | info | trade | personal | quest
  condition: string       // 触发条件表达式
  oneTime: boolean
  inkFile?: string        // 关联的 ink 文件路径（可选）
}

/** CSV 制作配方定义 */
export interface CraftingDef {
  id: number
  name: string
  inputItems: string[]
  inputQuantities: number[]
  outputItem: string
  outputQuantity: number
  requiredSkill: string
  requiredLevel: number
  craftTimeBlocks: number
}
