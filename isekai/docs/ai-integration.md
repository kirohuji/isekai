# AI 叙事集成设计

> DeepSeek V4 Flash 调用、Prompt 模板、响应解析、异步流程

---

## 一、整体架构

```
游戏引擎 → AI_TRIGGER(阶段10)
  │
  ├── 判断是否需要调 AI
  ├── 构建 prompt
  ├── 异步调用 DeepSeek API（不阻塞回合）
  └── 收到响应 → 解析 → 增量推送
```

### 触发条件

```typescript
function shouldCallAi(ctx: TurnContext): boolean {
  // 必须调
  if (ctx.hasSpecialEvent) return true
  if (ctx.isPlayerInitiated) return true  // 玩家主动请求
  if (ctx.turnSinceLastAiCall >= 10) return true  // 太久没调了

  // 不调
  if (ctx.turnSinceLastAiCall < 3) return false  // 频率限制
  if (!ctx.hasPlayerAction) return false         // 只是资源变化
  if (ctx.isRoutineTurn) return false            // 日常回合

  // 概率调——重大行动
  return ctx.isSignificantAction
}
```

---

## 二、Prompt 结构

### 系统提示词

```typescript
function buildSystemPrompt(ctx: TurnContext): string {
  return `你是异世界文字冒险游戏"灰丘领主"的 AI 主持人。

## 世界观
${WORLD_SETTING}  // 世界概述、势力、种族等

## 当前状态
${formatGameState(ctx)}

## 叙事规则
- 用**中文**，文学性叙事风格
- 每次输出 100-300 字
- 描述环境、NPC反应、主角感受
- 不要替玩家做决定
- 不要用"你选择了"——玩家已经选择了

## 输出格式
你必须在最后输出一个 JSON 块，格式如下：
---JSON
{
  "narrative": "叙事文本...",
  "actions": [
    { "id": 1, "category": "探索", "title": "侦察周边", "description": "..." },
    ...
  ],
  "personalityShift": { "bravery": 2, "kindness": -1 },
  "specialEvent": null
}
---JSON
`
}
```

### 用户提示词

```typescript
function buildUserPrompt(ctx: TurnContext): string {
  return `玩家在 ${ctx.locationName} 执行了: ${ctx.playerActionName}

## 当前游戏状态
位置: ${ctx.locationName} | 时段: ${ctx.timeBlock} | 天气: ${ctx.weather}
HP: ${ctx.hp}/${ctx.maxHp} | SP: ${ctx.sp}/${ctx.maxSp} | MP: ${ctx.mp}/${ctx.maxMp}
银币: ${ctx.silver} | 粮食: ${ctx.foodDays}天

附近NPC: ${ctx.nearbyNpcs.map(n => `${n.name}(好感${n.affection})`).join(', ')}

## 需要你做的
1. 根据玩家行动生成叙事
2. 生成下一回合的 4-6 个可选行动
3. 如果有 NPC 对话需求，在叙事中包含`
}
```

---

## 三、响应解析

```typescript
interface AiResponse {
  narrative: string
  actions: AiAction[]
  personalityShift?: Partial<PersonalityProfile>
  specialEvent?: {
    name: string
    narrative: string
    choices: Array<{ label: string; description: string }>
  }
}

function parseAiResponse(raw: string): AiResponse | null {
  // 从输出中提取 JSON 块
  const jsonMatch = raw.match(/---JSON\n([\s\S]*?)\n---JSON/)
  if (!jsonMatch) return null

  try {
    return JSON.parse(jsonMatch[1])
  } catch {
    // 解析失败 — 用原始文本作为叙事
    return { narrative: raw, actions: [] }
  }
}
```

---

## 四、错误处理

```typescript
class AiService {
  async generateNarrative(ctx: TurnContext): Promise<NarrativeResult> {
    try {
      const response = await this.callDeepSeek(ctx)
      const parsed = parseAiResponse(response)

      if (!parsed) {
        // 解析失败 → 用模板文本兜底
        return this.fallbackNarrative(ctx)
      }

      return parsed
    } catch (err) {
      if (err.status === 429) {
        // 频率限制 → 等下一回合再试
        return this.fallbackNarrative(ctx)
      }
      if (err.status === 500) {
        // 服务端错误 → 用模板
        return this.fallbackNarrative(ctx)
      }
      // 网络错误 → 用模板
      return this.fallbackNarrative(ctx)
    }
  }

  private async callDeepSeek(ctx: TurnContext): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,     // "deepseek-v4-flash"
        messages: [
          { role: 'system', content: buildSystemPrompt(ctx) },
          { role: 'user', content: buildUserPrompt(ctx) },
        ],
        temperature: 0.8,
        max_tokens: 1024,
      }),
    })

    const data = await response.json()
    return data.choices[0].message.content
  }
}
```

---

## 五、代码结构

```
apps/api/src/ai/
├── ai.module.ts              # NestJS Module
├── ai.service.ts             # DeepSeek API 调用
├── prompts/
│   ├── system-prompt.ts      # 系统提示词
│   ├── user-prompt.ts        # 用户提示词
│   └── context-formatter.ts  # 游戏状态 → 文本
├── parser/
│   ├── response-parser.ts    # AI 响应 → AiResponse
│   └── fallback.ts           # 解析失败兜底
├── throttle.ts               # 频率限制
└── narrative-optimizer.ts    # AI 调用优化（引用 time-system）
```
