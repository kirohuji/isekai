# 架构设计文档

> 项目：异世界生存：灰丘领主
> 类型：回合制文字冒险 / 叙事驱动 / 资源管理

---

## 一、系统架构总览

```
┌─────────────────────────────────────────────────┐
│                   客户端 (Client)                 │
│  React 19 + shadcn/ui + Zustand + @colyseus/react │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ StatusBar │ │Narrative │ │   ActionPanel    │ │
│  │ 状态栏    │ │ 叙事面板 │ │   行动选择面板    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│                        │                         │
│              ┌─────────┴─────────┐               │
│              │  Colyseus Client  │               │
│              │  WebSocket 连接    │               │
│              └─────────┬─────────┘               │
└────────────────────────┼─────────────────────────┘
                         │ ws://localhost:2567
                         ▼
┌─────────────────────────────────────────────────┐
│              服务端 (NestJS + Colyseus)           │
│                                                   │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │  Colyseus      │  │  NestJS REST API        │  │
│  │  GameRoom      │  │  /api/game/*            │  │
│  │  (WebSocket)   │  │  /api/save/*            │  │
│  │  - 房间管理    │  │  /api/ai/*              │  │
│  │  - 状态同步    │  └────────────────────────┘  │
│  │  - 行动处理    │                               │
│  └───────┬────────┘                               │
│          │                                        │
│  ┌───────┴────────────────────────────────────┐  │
│  │           引擎核心 (13 子系统)               │  │
│  │  TurnManager → 12阶段 → 各子系统协作        │  │
│  │  所有子系统只认 Repository 接口             │  │
│  └───────┬────────────────────────────────────┘  │
│          │                                        │
│  ┌───────┴────────────────────────────────────┐  │
│  │       Repository 实现 (Prisma + SQLite)     │  │
│  │  开发和生产用同一套，不区分模式             │  │
│  │  数据都在 SQLite 里                          │  │
│  └───────┬────────────────────────────────────┘  │
│          │                                        │
│  ┌───────┴────────────────────────────────────┐  │
│  │       数据源：SQLite                        │  │
│  │                                        │  │
│  │  CSV 文件 (apps/api/data/*.csv)            │  │
│  │  Excel/VS Code 编辑，作为源文件              │  │
│  │         │  pnpm db:load                    │  │
│  │         ▼                                  │  │
│  │  SQLite 数据库 ← 开发和生产都用这个          │  │
│  │                                        │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 二、技术栈

| 分层 | 技术 | 用途 |
|------|------|------|
| **前端框架** | React 19 | UI 组件 |
| **UI 组件库** | shadcn/ui (Radix + Tailwind) | 界面元素 |
| **状态管理** | Zustand | 本地 UI 状态 |
| **实时通信** | Colyseus v0.17 + @colyseus/react | WebSocket 状态同步 |
| **叙事脚本** | inkjs (Ink) | 可选分支叙事（后续集成） |
| **后端框架** | NestJS 11 | REST API 和模块组织 |
| **游戏服务器** | Colyseus v0.17 | 房间管理、状态同步 |
| **WebSocket** | @colyseus/ws-transport | 传输层 |
| **状态 Schema** | @colyseus/schema | 可同步状态定义 |
| **数据库** | SQLite (Prisma) | 持久化，开发也用 SQLite |
| **CSV 数据** | — | 游戏配置数据（地点/NPC/物品等），CSV 编辑→灌入 SQLite |
| **AI** | DeepSeek V4 Flash API | 叙事生成 |

---

## 三、分层职责

### 3.1 前端层 (apps/web)

```
src/
├── main.tsx                    # 入口
├── App.tsx                     # 根组件
├── index.css                   # 暗色主题样式
├── lib/utils.ts                # cn() 工具函数
├── colyseus/client.ts          # Colyseus Client 实例
├── hooks/
│   └── useGameRoom.ts          # 房间连接 + 状态同步 Hook
├── stores/
│   ├── game.store.ts           # 游戏状态 (Zustand)
│   └── ui.store.ts             # UI 控制状态 (后续)
├── types/
│   └── game.ts                 # 客户端类型定义
└── components/
    ├── ui/                     # shadcn UI 组件
    │   └── scroll-area.tsx
    └── game/
        ├── GameScreen.tsx      # 主游戏画面（组装）
        ├── StatusBar.tsx       # 状态栏
        ├── NarrativePanel.tsx  # 叙事面板
        └── ActionPanel.tsx     # 行动面板
```

**核心数据流：**

```
Colyseus Room (WebSocket)
    │  onStateChange()
    ▼
useRoomState() hook  →  不可变快照
    │
    ▼
Zustand game.store  →  React 组件 re-render
    │
    ▼
用户选择行动 → sendAction(id) → room.send('action', data)
```

### 3.2 服务端层 (apps/api)

```
src/
├── main.ts                          # 启动（NestJS + Colyseus）
├── app.module.ts                    # 根模块
├── app.config.ts                    # Colyseus 服务配置
├── game/
│   ├── game.module.ts
│   └── game.controller.ts           # REST: health, save, load
├── colyseus/
│   ├── colyseus.module.ts
│   ├── colyseus.service.ts          # 启动 Colyseus 服务器
│   ├── game.room.ts                 # 游戏房间（核心）
│   └── game.state.ts                # 同步状态 Schema（仅结构化数据）
│
├── engine/                          # 回合引擎
│   ├── engine.module.ts
│   ├── turn.manager.ts              # 回合管理器（12阶段编排）
│   ├── phases/                      # 12 个阶段实现
│   ├── character/                   # 属性/状态/性格/心理
│   ├── items/                       # 物品/装备/背包
│   ├── skills/                      # 技能/升级
│   ├── gating/                      # 行动门控引擎（10道门控）
│   ├── locations/                   # 地点/连接/设施/发现
│   ├── travel/                      # 移动系统
│   ├── events/                      # 事件系统（触发/选择/链）
│   ├── quests/                      # 任务系统（阶段/奖励）
│   ├── dialogue/                    # 对话系统（inkjs集成/AI/兜底）
│   ├── combat/                      # 战斗系统（自动结算）
│   ├── economy/                     # 经济系统（价格/商人/交易）
│   ├── weather/                     # 天气 × 季节
│   ├── npc/                         # NPC tick/行为/叙事
│   ├── causality/                   # 因果链（flag/延迟事件/记忆）
│   ├── rules/                       # 规则系统（Condition/Effect/ModifierResolver）
│   └── performance/                 # 性能优化
│
├── ai/
│   ├── ai.module.ts
│   ├── ai.service.ts                # DeepSeek V4 Flash 调用
│   ├── prompts/                     # prompt 模板
│   ├── parser/                      # 响应解析
│   └── throttle.ts                  # 频率限制
│
├── save/
│   ├── save.module.ts
│   ├── save.controller.ts           # REST API
│   ├── save.service.ts
│   ├── save.serializer.ts
│   └── save.deserializer.ts
│
├── prisma/
│   ├── prisma.module.ts
│   ├── prisma.service.ts            # PrismaClient 封装
│   └── prisma.helper.ts             # 查询 Helper
│
└── ink/
    └── ink-bridge.ts                # ink 变量 ↔ 游戏状态同步
```

### 3.3 前端额外目录

```
apps/web/src/
├── ...（已有）
└── ink/                              # inkjs 运行时
    ├── stories/                       # .ink 源文件（对话树/剧情）
    ├── compiler.ts                    # ink → JSON 编译
    └── story-manager.ts               # 加载/变量同步
```

### 3.3 共享层 (packages/shared)

```
packages/shared/src/
└── index.ts       # 共享类型、常量（前后端共用）
```

---

## 四、数据流：CSV → SQLite → 引擎

### 4.1 数据流向

```
CSV 源文件                   SQLite 数据库              引擎
─────────                   ──────────────              ──
apps/api/data/
├── locations.csv    ──→  locations 表  ──→  LocationRepo
├── npcs.csv         ──→  characters+npcs  ─→  NpcRepo
├── items.csv        ──→  inventory 表    ─→  ItemRepo
├── events.csv       ──→  event_templates ─→  EventRepo
├── skills.csv       ──→  skills 表       ─→  SkillRepo
├── merchants.csv    ──→  (locations 扩展) ─→  MerchantRepo
└── enemies.csv      ──→  (npcs 扩展)     ─→  EnemyRepo
                      │
               pnpm db:load
               (CSV → SQLite)
```

### 4.2 开发流程

```
1. 编辑 CSV 文件（Excel / VS Code）
2. 运行 pnpm db:load → CSV 数据灌入 SQLite
3. 运行 pnpm dev → NestJS 启动，Prisma 从 SQLite 读数据
4. 改数据 → 改 CSV → 再跑 pnpm db:load
```

CSV 是**源文件**，SQLite 是**运行时数据源**，引擎通过 Repository 接口读 SQLite。

### 4.3 Repository 接口

```typescript
interface LocationRepo {
  getById(id: number): Promise<LocationDef | null>
  getAll(): Promise<LocationDef[]>
  getByTag(tag: LocationTag): Promise<LocationDef[]>
  getConnected(locationId: number): Promise<Connection[]>
}

// PrismaLocationRepo 是唯一实现
// 开发和生产都用它
class PrismaLocationRepo implements LocationRepo {
  constructor(private prisma: PrismaClient) {}
  async getById(id: number) {
    const row = await this.prisma.location.findUnique({ where: { id } })
    return row ? this.toLocationDef(row) : null
  }
  // ...
}
```

引擎所有子系统只认 Repository 接口。换数据源只需要换 Repo 实现——但因为我们 CSV+SQLite 一把到底，连这个都不需要。

### 4.1 一次完整的回合

```
客户端                             服务端
  │                                  │
  │  1. 加入房间 joinOrCreate()       │
  │ ─────────────────────────────►    │
  │                                  │── onCreate() 初始化状态
  │  2. 初始状态同步                  │
  │ ◄─────────────────────────────   │
  │                                  │
  │  3. 显示状态栏 + 叙事 + 行动      │
  │                                  │
  │  4. 用户选择行动                  │
  │  send('action', {actionId})      │
  │ ─────────────────────────────►    │
  │                                  │── 5. handlePlayerAction()
  │                                  │   a. 校验行动合法性
  │                                  │   b. GameEngine.advanceTurn()
  │                                  │      - 扣除时段
  │                                  │      - 消耗体力/资源
  │                                  │      - 跨天检查
  │                                  │   c. EventSystem.check()
  │                                  │      - 检查事件触发条件
  │                                  │   d. AiService.generate()
  │                                  │      - 生成叙事文本
  │                                  │      - 生成行动选项
  │                                  │   e. 更新 GameState
  │                                  │
  │  6. 新状态同步                    │
  │ ◄─────────────────────────────   │
  │                                  │
  │  7. 更新 UI，回到步骤 3           │
  │                                  │
```

### 4.2 时间推进规则

```
一天 = 7 个时段:
  黎明 → 清晨 → 上午 → 正午 → 下午 → 傍晚 → 夜晚

每个行动消耗 1-4 个时段。
跨过"夜晚"时段 = 跨天触发:
  - 每人消耗 1 粮食
  - 无粮食 → HP -15/天
  - 休息时段恢复 HP/SP/MP
  - 红月倒计时 -1
```

---

## 五、Colyseus 房间设计

### 房间类型

| 房间名 | 用途 | 说明 |
|--------|------|------|
| `game` | 游戏主房间 | 每局游戏一个房间，状态全量同步 |

### GameRoom 生命周期

```
onCreate()
  → 初始化 GameState
  → 注册 message handlers

onJoin(client)
  → 创建 PlayerSchema
  → 添加到 state.players

onLeave(client)
  → 从 state.players 移除

onDispose()
  → 清理资源（后续：自动存档）
```

### Schema 状态树

```
GameState
├── year: number          # 年份
├── month: number         # 月份
├── day: number           # 日期
├── timeBlock: string     # 当前时段
├── locationName: string  # 当前位置
├── region: string        # 当前区域
├── redMoonCountdown      # 红月倒计时
├── turn: number          # 回合计数
├── narrative: string     # 当前叙事文本
├── availableActions      # 可选行动列表 [string]
├── isPlayerTurn: boolean # 是否等待玩家操作
│
├── players: MapSchema<Player>   # 房间内玩家
│   └── Player
│       ├── sessionId: string
│       ├── name: string
│       ├── hp / maxHp: number
│       ├── sp / maxSp: number
│       ├── mp / maxMp: number
│       └── silver: number
│
└── (后续扩展)
    ├── partyMembers: []        # 队伍成员
    ├── inventory: []           # 物品
    ├── relationships: Map      # 好感度
    └── reputations: Map        # 声望
```

---

## 六、AI 叙事集成（DeepSeek V4 Flash）

```
AiService
├── generateNarrative(context, action)
│   → 调用 DeepSeek API
│   → 返回 { narrative: string, actions: Action[] }
│
├── chat(message, history)
│   → NPC 对话 / 自由输入处理
│
└── buildSystemPrompt()
    → 构建带世界观设定的系统提示词
```

**提示词结构：**

```
系统提示：
  - 世界观设定（世界概述、势力关系）
  - 回合格式要求（标准输出模板）
  - 叙事风格（文学性、氛围）
  - 规则约束（资源消耗、时间推进）

用户输入：
  - 当前游戏状态（JSON）
  - 玩家选择的行动

AI 输出：
  - narrative: 叙事段落
  - actions: 下一回合可选行动列表
```

---

## 七、目录结构总览

```
isekai/
├── package.json                  # pnpm workspace 根
├── pnpm-workspace.yaml
├── docs/
│   ├── architecture.md           # ← 本文档
│   └── database-schema.md        # 数据库设计
│
├── apps/
│   ├── api/                      # NestJS + Colyseus
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── game/             # REST API
│   │       └── colyseus/         # WebSocket 游戏服务
│   └── web/                      # React 前端
│       └── src/
│           ├── components/game/
│           ├── stores/
│           ├── hooks/
│           └── colyseus/
│
└── packages/
    └── shared/                   # 共享类型
```
