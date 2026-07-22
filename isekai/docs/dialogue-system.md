# 对话系统设计

> 对话树、inkjs 集成、NPC 性格驱动、上下文感知

---

## 一、分层架构

对话分三层，自上而下回退：

```
          ┌──────────────────────────────────┐
          │  层1: inkjs 手写对话树            │
          │  精细打磨的剧情对话                │
          │  有分支、有条件、有变量追踪         │
          │  触发方式: 事件/任务/玩家主动选择   │
          └───────────┬──────────────────────┘
                      │ 如果没有 ink 脚本
                      ▼
          ┌──────────────────────────────────┐
          │  层2: AI 生成对话                 │
          │  普通 NPC 闲聊、非剧情交互         │
          │  基于 NPC 性格 + 关系 + 上下文     │
          │  触发方式: 玩家选"交谈"时          │
          └───────────┬──────────────────────┘
                      │ 如果 AI 也没开
                      ▼
          ┌──────────────────────────────────┐
          │  层3: 模板对话                    │
          │  最基础的兜底                      │
          │  "{npc}看了你一眼，没说话。"       │
          └──────────────────────────────────┘
```

### 三层的触发判断

```typescript
function getDialogue(npcId: number, topic: string, ctx: TurnContext): DialogueResult {
  // 1. 是否有 ink 脚本？
  const inkScript = inkRegistry.get(npcId, topic)
  if (inkScript) return runInkStory(inkScript, ctx)

  // 2. 是否有 AI（DeepSeek）可用？
  if (aiService.isAvailable()) {
    return aiService.generateDialogue(npcId, topic, ctx)
  }

  // 3. 兜底模板
  return fallbackDialogue(npcId, ctx)
}
```

---

## 二、inkjs 集成

### 2.1 ink 在项目中的位置

```
apps/web/src/ink/
├── stories/
│   ├── npc-001-shen-qinglan.ink    # 沈清岚对话线
│   ├── npc-002-gran.ink             # 格兰对话线
│   ├── npc-003-mia.ink              # 米娅对话线
│   ├── events/
│   │   ├── old-amulet.ink           # 护符剧情
│   │   └── gray-hill-building.ink   # 灰丘建设剧情
│   └── common/
│       └── greetings.ink            # 通用开场白
├── compiler.ts                      # ink → JSON 编译
└── story-manager.ts                 # 故事加载/状态/变量同步
```

### 2.2 ink 脚本示例

```ink
// npc-001-shen-qinglan.ink
// 沈清岚的对话树

VAR affection = 0
VAR trust = 0
VAR has_list = false

=== greet ===
她抬头看了你一眼。
{affection >= 50:
  "你来了。"声音比平时软了一些。
- else:
  "有事？"简短，直接。
}

-> choice

=== choice ===
+ [聊聊日常] -> daily_chat
+ [打听情报] {trust >= 30} -> ask_info
+ [关于名单] {trust >= 60 && has_list == false} -> ask_list
+ [关于名单] {has_list == true} -> already_has_list
+ [告别] -> end

=== daily_chat ===
沈清岚靠在墙边，手指无意识地卷着袖口。
"今天天气……还行。"她说。
~ affection += 2
-> choice

=== ask_info ===
"你想要什么样的情报？"她凑近了一些，声音压低。
+ [神殿动向] -> temple_info
+ [暮河镇消息] -> river_town_info
+ [算了] -> choice

=== temple_info ===
"神殿最近在往边境增派人手。"她顿了顿。
"具体原因我也不清楚，但肯定和红月有关。"
~ trust += 3
-> choice

=== ask_list ===
她沉默了很久。久到你以为她不会回答了。
"那份名单……"她终于开口，"不只是名字。"
"上面还有每个人的能力类型、召唤日期、当前状态。"
~ has_list = true
"你真的准备好要看了吗？"
+ [当然] -> get_list
+ [再等等] -> wait_list

=== get_list ===
她从怀里取出一卷泛黄的纸，递给你。
~ trust += 10
~ affection += 5
"别弄丢了。这是副本。"
=== end ===
```

### 2.3 ink 变量同步

ink 的变量和游戏状态之间的双向同步：

```typescript
class InkStoryManager {
  private stories: Map<string, Story> = new Map()

  /** 加载 NPC 对话线并同步游戏状态到 ink 变量 */
  loadStory(npcId: number, ctx: TurnContext): Story {
    const inkScript = INK_SCRIPTS[npcId]
    const story = new Story(inkScript)

    // 游戏状态 → ink 变量
    story.variablesState['affection'] = ctx.relationships.get(npcId)?.affection ?? 0
    story.variablesState['trust'] = ctx.relationships.get(npcId)?.trust ?? 0
    story.variablesState['has_list'] = ctx.flags.get('got_list_from_shen') === 'true'

    return story
  }

  /** 选择后：ink 变量 → 游戏状态 */
  syncBack(story: Story, ctx: TurnContext): void {
    const affectionDelta = story.variablesState['affection'] - ctx.relationships.get(npcId)?.affection
    if (affectionDelta !== 0) {
      ctx.modifyAffection(npcId, affectionDelta)
    }
    // 同步其他变量变化
  }
}
```

### 2.4 对话在回合中的位置

```
玩家选择 [社交] 和沈清岚交谈
  │
  ├── 阶段 4: PLAYER_ACTION
  │   ├── 扣除: 1 时段, 5 SP
  │   └── 启动对话模式
  │
  ├── 对话模式（子循环）
  │   ├── 展示 ink 文本 → 客户端渲染
  │   ├── 展示 ink 选项
  │   ├── 等待玩家选择
  │   ├── 推进 ink 故事
  │   └── 重复直到对话结束
  │
  └── 对话结束后
      ├── 同步 ink 变量到游戏状态
      ├── 推进时段（对话消耗了时段）
      └── 回到常规回合
```

---

## 三、AI 生成对话（层2）

### 3.1 何时使用 AI 对话

```
inkjs 覆盖的场景:
  ├── 核心角色（沈清岚、格兰、米娅...）
  ├── 剧情关键对话
  └── 有分支树的重要交互

AI 生成对话:
  ├── 次要 NPC（路人、村民、商人...）
  ├── 非剧情闲聊（ink 里没写的日常话题）
  └── 玩家自由输入（不选选项，自己打字）
```

### 3.2 AI 对话的 prompt

```typescript
function buildDialoguePrompt(npc: Npc, ctx: TurnContext): string {
  return `你是一个异世界文字冒险游戏的 NPC。
  
NPC 信息:
- 名字: ${npc.name}
- 性格: ${npc.personality}（例如：理性/务实/温柔/警惕）
- 和玩家的关系: 好感度 ${ctx.affection}，信任度 ${ctx.trust}
- 当前情绪: ${ctx.npcMood}

最近的记忆:
${ctx.npcMemories.slice(0, 3).map(m => `- ${m.narrative}`).join('\n')}

当前场景:
- 地点: ${ctx.locationName}
- 时间: ${ctx.timeBlock}
- 玩家刚做了什么: ${ctx.lastPlayerAction}

请生成 ${npc.name} 对玩家说的话。
要求: 自然、符合性格、体现当前关系状态。
如果玩家做了让 NPC 印象深刻的事，应该提及。
输出格式: 纯文本对话内容。`
}
```

---

## 四、对话门控

### 4.1 可用的对话主题

每个 NPC 有哪些话题可以聊，由当前状态动态计算：

```typescript
interface DialogueTopic {
  id: string
  label: string              // 显示给玩家的文本
  /** 可用条件 */
  condition: Condition
  /** 触发后是否消耗此话题（一次性） */
  oneTime?: boolean
  /** 话题类别 */
  category: 'info' | 'personal' | 'quest' | 'daily'
}

function getAvailableTopics(npcId: number, ctx: TurnContext): DialogueTopic[] {
  return DIALOGUE_TOPICS[npcId].filter(topic => {
    // ink 条件已经在 ink 里了
    // 这里只处理 AI/模板层的门控
    return topic.condition.evaluate(ctx)
  })
}
```

### 4.2 NPC 对话状态机

```
空闲 ──[玩家选择交谈]──→ 对话中 ──[选择告别]──→ 空闲
                           │
                           ├── 普通话题 → 对话继续
                           ├── 敏感话题 → 好感度变化
                           ├── 雷区话题 → NPC 反应
                           └── 触发事件 → 对话中断，切入事件
```

### 4.3 NPC 的雷区和触发点

```typescript
interface NpcDialogueTrigger {
  npcId: number
  /** 雷区——触碰会触发负面反应 */
  landmines: Array<{
    topicId: string
    reaction: string       // "她脸色沉了下来。"
    affectionPenalty: number
    trustPenalty: number
  }>
  /** 触发点——特定条件下解锁特殊对话 */
  triggers: Array<{
    condition: Condition
    dialogue: string       // "她突然开口：'我想起了一件事……'"
    priority: number       // 高优先级触发点会打断当前话题
  }>
}
```

---

## 五、对话与现有系统的集成

```
对话系统
  │
  ├── 规则系统 ── 对话可用条件复用 Condition
  │
  ├── 因果链 ── 对话选项 → 设 flag / 改关系 → 后续事件
  │
  ├── 性格系统 ── NPC 性格影响对话风格 + 玩家选择影响玩家性格
  │
  ├── 心理状态 ── 玩家心理状态影响可用对话选项
  │
  ├── 门控引擎 ── 对话作为一类行动，走 10 道门控
  │
  ├── 事件系统 ── 对话可能触发事件
  │
  ├── 任务系统 ── 对话可能推进任务阶段
  │
  └── inkjs ── 精细对话树，AI 做兜底
```

---

## 六、代码结构规划

```
apps/web/src/ink/                  # 前端 ink 运行时
├── stories/                        # .ink 源文件
├── compiler.ts                     # 编译 ink → JSON
└── story-manager.ts                # 故事加载/变量同步

apps/api/src/engine/dialogue/       # 后端对话逻辑
├── dialogue.types.ts               # 对话类型定义
├── dialogue-manager.ts             # 对话管理器（三层回退）
├── dialogue-topics.ts              # NPC 话题注册
├── dialogue-gate.ts                # 对话门控
├── ink-bridge.ts                   # ink 变量 ↔ 游戏状态同步
├── ai-dialogue.ts                  # AI 对话生成
└── npc-dialogue-data.ts            # NPC 对话数据（雷区/触发点）
```
