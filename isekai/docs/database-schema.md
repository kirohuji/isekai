# 数据库表结构设计

> 基于 `游戏模式/02-数据库设计.md` 整理
> ORM: Prisma + SQLite
> 继承策略：类表继承（Class Table Inheritance）—— Character 作为基表，Player / Npc 作为扩展表

---

## 一、设计决策：为什么 Player 和 NPC 共用基类？

### 1.1 共性的提取

玩家和 NPC 在游戏中有大量共通属性：

| 属性 | Player | NPC | 说明 |
|------|--------|-----|------|
| `name` | ✅ | ✅ | 名称 |
| `gender` | ✅ | ✅ | 性别 |
| `description` | ✅ | ✅ | 描述 |
| `location` | ✅ | ✅ | 当前位置 |
| `isAlive` | ✅ | ✅ | 存活状态 |

### 1.2 继承方式

```
Character (基类)
  ├── Player (扩展：资源、存档相关)
  └── Npc    (扩展：种族、招募状态)
```

### 1.3 为什么用类表继承（CTI）而非单表继承（STI）

| 方式 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| **STI**（单表） | 一张大表，`type` 字段区分 | 查询简单 | 大量 nullable 字段，Schema 膨胀 |
| **CTI**（类表） | Character 基表 + Player/Npc 分表 | 字段精确，无空值，类型安全 | 查询需要 JOIN |

**选择 CTI**——Prisma 通过 1:1 关系实现，SQLite 完全支持。

### 1.4 Prisma 实现方式

Prisma 没有 `extends` 继承语法，但用 **1:1 关系 + `@id` 复用主键**可以达到同样效果：

```prisma
// Character 表的 id 同时是 Player 和 Npc 表的主键
model Player {
  characterId Int       @id  // ← 主键，不自增，引用 Character.id
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  // Player 专有字段...
}

model Npc {
  characterId Int       @id  // ← 主键，不自增，引用 Character.id
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  // Npc 专有字段...
}
```

这样：
- `Character` 负责公共属性
- `Player` / `Npc` 负责专有属性
- 查玩家：`prisma.player.findUnique({ include: { character: true } })`
- 查 NPC：`prisma.npc.findUnique({ include: { character: true } })`
- 查所有角色：`prisma.character.findMany({ include: { player: true, npc: true } })`

---

## 二、完整 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

### 2.1 Character — 角色基类

```prisma
/// 角色基类——Player 和 Npc 的公共属性
model Character {
  id          Int       @id @default(autoincrement())
  name        String    @default("未命名")
  gender      String    @default("男")
  description String?
  avatar      String?   /// 头像标识
  isAlive     Boolean   @default(true)

  // 位置
  locationId  Int?
  location    Location? @relation(fields: [locationId], references: [id])

  // 1:1 扩展（只有一个会非空）
  player      Player?
  npc         Npc?

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### 2.2 Player — 玩家

```prisma
/// 玩家——游戏主角的状态
model Player {
  characterId Int       @id
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)

  // 核心资源
  health      Int       @default(100)
  maxHealth   Int       @default(100)
  stamina     Int       @default(100)
  maxStamina  Int       @default(100)
  mental      Int       @default(100)
  maxMental   Int       @default(100)
  silver      Int       @default(120)
  copper      Int       @default(0)
  foodDays    Int       @default(7)
  medicineCount Int     @default(0)

  // 时间
  currentTimeBlock String @default("清晨")
  currentDateYear  Int    @default(847)
  currentDateMonth Int    @default(9)
  currentDateDay   Int    @default(15)
  redMoonCountdown Int    @default(700)

  // 游戏状态
  turnCount   Int       @default(0)

  // 子表关联
  inventory   Inventory[]
  flags       Flag[]
  skills      Skill[]
  quests      Quest[]
  eventLogs   EventLog[]
  reputations Reputation[]
  party       Party[]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### 2.3 Npc — NPC

```prisma
/// NPC——游戏中的非玩家角色
model Npc {
  characterId Int       @id
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)

  race        String    @default("人类")
  isRecruited Boolean   @default(false)

  // 关系（从 Player 到这个 NPC）
  relationships Relationship[]
  partyMembers  Party[]
}
```

### 2.4 Location — 地点

```prisma
/// 地点
model Location {
  id          Int       @id @default(autoincrement())
  name        String
  region      String?   /// 所属区域
  description String?
  isSafe      Boolean   @default(true)
  travelCost  Int       @default(1)     /// 移动消耗的时段数

  connectedLocations String @default("[]") /// JSON: 相邻地点ID列表
  specialTags        String @default("[]") /// JSON: 标签 [city, town, wild, ...]

  characters Character[]
}
```

### 2.5 Inventory — 物品

```prisma
/// 物品
model Inventory {
  id          Int      @id @default(autoincrement())
  playerId    Int
  player      Player   @relation(fields: [playerId], references: [characterId], onDelete: Cascade)

  itemName    String
  itemType    String   @default("misc") /// weapon/armor/food/medicine/material/quest/key
  quantity    Int      @default(1)
  description String?
  isEquipped  Boolean  @default(false)
}
```

### 2.6 Relationship — 好感度/关系

```prisma
/// 玩家与NPC的好感度关系
model Relationship {
  id        Int @id @default(autoincrement())
  playerId  Int
  player    Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)
  npcId     Int
  npc       Npc    @relation(fields: [npcId], references: [characterId], onDelete: Cascade)

  affection Int    @default(0)  /// -100 ~ +100
  trust     Int    @default(0)  /// 0 ~ 100
  status    String @default("陌生人") /// 陌生人/熟人/朋友/亲密/敌对

  @@unique([playerId, npcId])
}
```

### 2.7 Reputation — 势力声望

```prisma
/// 势力声望
model Reputation {
  id          Int    @id @default(autoincrement())
  playerId    Int
  player      Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)

  factionName String
  reputation  Int    @default(0) /// -100 ~ +100

  @@unique([playerId, factionName])
}
```

### 2.8 Skill — 技能

```prisma
/// 技能
model Skill {
  id          Int    @id @default(autoincrement())
  playerId    Int
  player      Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)

  skillName   String
  level       Int    @default(1)
  experience  Int    @default(0)

  @@unique([playerId, skillName])
}
```

### 2.9 EventTemplate — 事件模板

```prisma
/// 事件模板
model EventTemplate {
  id            Int    @id @default(autoincrement())
  name          String
  category      String /// exploration/social/resource/survival/combat/romance/plot/daily
  narrativeBase String /// 基础叙事文本（含 {param} 占位符）

  conditionJson String @default("{}")  /// JSON: 触发条件
  choicesJson   String @default("[]")  /// JSON: 选项列表
  cooldownDays  Int    @default(0)
  isRepeatable  Boolean @default(true)
  priority      Int    @default(5)     /// 1(低) ~ 10(高)

  eventLogs EventLog[]
}
```

**conditionJson 结构：**

```json
{
  "locationTypes": ["city", "town"],
  "timeBlocks": ["上午", "下午", "傍晚"],
  "minMental": 30,
  "requiredFlags": { "hasMetMaid": "true" },
  "forbiddenFlags": { "triggeredThisWeek": "true" },
  "randomChance": 25,
  "minAffection": { "沈清岚": 30 }
}
```

**choicesJson 结构：**

```json
[
  {
    "label": "保持距离，观察对方",
    "skillCheck": { "skill": "危机判断", "dc": 10 },
    "success": { "narrative": "...", "flagSet": "foundClue" },
    "failure": { "narrative": "..." }
  },
  {
    "label": "上前搭话",
    "minMental": 50,
    "outcome": "trigger:randomNpcEncounter"
  }
]
```

### 2.10 EventLog — 事件日志

```prisma
/// 事件触发记录
model EventLog {
  id              Int    @id @default(autoincrement())
  playerId        Int
  player          Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)

  eventTemplateId Int?
  eventTemplate   EventTemplate? @relation(fields: [eventTemplateId], references: [id])
  eventName       String
  choiceMade      String?   /// 玩家选择
  outcome         String?   /// 结果描述

  triggeredAtYear      Int
  triggeredAtMonth     Int
  triggeredAtDay       Int
  triggeredAtTimeBlock String
}
```

### 2.11 Flag — 全局标记

```prisma
/// 全局标记——追踪剧情推进状态
model Flag {
  id        Int    @id @default(autoincrement())
  playerId  Int
  player    Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)

  flagName  String
  flagValue String?  /// "true" / "false" / 数值 / 文本

  @@unique([playerId, flagName])
}
```

### 2.12 Quest — 任务

```prisma
/// 任务/目标
model Quest {
  id              Int    @id @default(autoincrement())
  playerId        Int
  player          Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)

  questName        String
  questDescription String?
  questStatus      String @default("进行中") /// 进行中/已完成/已失败
}
```

### 2.13 Party — 队伍成员

```prisma
/// 队伍成员——玩家携带的 NPC
model Party {
  id        Int @id @default(autoincrement())
  playerId  Int
  player    Player @relation(fields: [playerId], references: [characterId], onDelete: Cascade)
  npcId     Int
  npc       Npc    @relation(fields: [npcId], references: [characterId], onDelete: Cascade)

  role      String @default("成员") /// 成员/同伴/雇佣兵
}
```

---

## 三、ER 关系图（Prisma）

```
Character (基类)
  │
  ├── 1:1 ── Player
  │            ├── 1:N ── Inventory
  │            ├── 1:N ── Flag
  │            ├── 1:N ── Skill
  │            ├── 1:N ── Quest
  │            ├── 1:N ── EventLog
  │            ├── 1:N ── Reputation
  │            ├── 1:N ── Party
  │            └── 1:N ── Relationship (as player)
  │
  ├── 1:1 ── Npc
  │            ├── 1:N ── Party (as npc)
  │            └── 1:N ── Relationship (as npc)
  │
  └── N:1 ── Location
               └── 1:N ── Character

EventTemplate ── 1:N ── EventLog
```

---

## 四、使用示例（Prisma Client）

### 4.1 创建玩家

```typescript
const player = await prisma.character.create({
  data: {
    name: '旅者',
    description: '被召唤到异世界的高中生',
    locationId: 1,
    player: {
      create: {
        health: 100,
        stamina: 100,
        mental: 100,
        silver: 120,
      },
    },
  },
  include: { player: true },
})
```

### 4.2 创建 NPC

```typescript
const npc = await prisma.character.create({
  data: {
    name: '沈清岚',
    gender: '女',
    description: '短发女同学。极强记忆力。',
    locationId: 10,
    npc: {
      create: {
        race: '人类',
        isRecruited: false,
      },
    },
  },
  include: { npc: true },
})
```

### 4.3 查询玩家（含资源）

```typescript
const playerState = await prisma.character.findFirst({
  where: { player: { isNot: null } },
  include: {
    player: {
      include: {
        inventory: true,
        flags: true,
        skills: true,
      },
    },
    location: true,
  },
})
```

### 4.4 查询 NPC（含好感度）

```typescript
const npcWithRelationship = await prisma.character.findFirst({
  where: { npc: { isNot: null }, name: '沈清岚' },
  include: {
    npc: {
      include: {
        relationships: {
          where: { playerId: currentPlayerId },
        },
      },
    },
    location: true,
  },
})
```

---

## 五、Prisma 安装与配置

### 5.1 依赖

```json
{
  "dependencies": {
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0"
  }
}
```

### 5.2 .env

```env
DATABASE_URL="file:./data/gray-hill.db"
```

### 5.3 初始化

```bash
npx prisma init
npx prisma db push    # 开发时同步 Schema 到数据库
npx prisma generate   # 生成 Client
npx prisma studio     # 可视化数据库管理
```

### 5.4 NestJS 集成

```typescript
// apps/api/src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect() }
  async onModuleDestroy() { await this.$disconnect() }
}
```

---

## 六、使用体验优化：Helper 模式

**问题**：继承方案每次查玩家都要 `include: { character: true }`，有点烦。

```typescript
// ❌ 每次都要写 include
const p = await prisma.player.findUnique({
  where: { characterId: id },
  include: { character: true }
})
p.character.name  // 名字在 character 上
```

**解决**：封装一层 Helper，把重复的 include 藏起来。

```typescript
// apps/api/src/prisma/prisma.helper.ts
import { PrismaClient } from '@prisma/client'

export class PrismaHelper {
  constructor(private prisma: PrismaClient) {}

  /** 查玩家（自动 include character） */
  async findPlayer(id: number) {
    return this.prisma.player.findUnique({
      where: { characterId: id },
      include: { character: true },
    })
  }

  /** 查玩家列表 */
  async findPlayers() {
    return this.prisma.player.findMany({
      include: { character: true },
    })
  }

  /** 查 NPC（自动 include character） */
  async findNpc(id: number) {
    return this.prisma.npc.findUnique({
      where: { characterId: id },
      include: { character: true },
    })
  }

  /** 查所有角色（统一查 Character 表，区分 player/npc 关系） */
  async findAllCharacters() {
    return this.prisma.character.findMany({
      include: { player: true, npc: true, location: true },
    })
  }
}
```

使用时：
```typescript
const helper = new PrismaHelper(prisma)
const player = await helper.findPlayer(1)
player.character.name  // ← 仍然要 .character，但不用写 include 了
```

如果还是觉得 `.character.name` 啰嗦，可以在 API 返回层做映射：
```typescript
// controller 层：映射成前端友好格式
function toPlayerResponse(player: Player & { character: Character }) {
  return {
    id: player.characterId,
    name: player.character.name,
    gender: player.character.gender,
    hp: player.health,
    sp: player.stamina,
    mp: player.mental,
    // ...
  }
}
```

---

## 七、开发策略：CSV 编辑 → SQLite 运行

### 7.1 CSV 作为源文件

游戏配置数据（地点、NPC、物品、事件模板等）存储在 CSV 文件中。

```
优势:
  ├── Excel / VS Code 直接编辑
  ├── 非技术人员也能改（策划填表）
  ├── git diff 清晰可见
  └── 不依赖任何 ORM 或数据库工具
```

### 7.2 CSV 文件列表

```
apps/api/data/
├── locations.csv          # 地点数据
├── npcs.csv               # NPC 数据
├── items.csv              # 物品数据
├── event-templates.csv    # 事件模板
├── skills.csv             # 技能数据
├── merchants.csv          # 商人数据
└── enemies.csv            # 敌人数据
```

### 7.3 CSV → SQLite 加载流程

```bash
pnpm db:load     # 读取所有 CSV，灌入 SQLite
pnpm db:reset    # 清空数据库，重新加载
pnpm dev         # 正常启动，Prisma 从 SQLite 读
```

### 7.4 CSV 格式示例

**locations.csv：**

```csv
id,name,region,description,is_safe,travel_cost,connected_locations,tags
1,旧鹿角旅馆,王都平民区,"六间客房的小旅馆。",1,0,"[2,3,4]","city,indoor"
2,北门集市,王都,"粮食、药草交易场所。",1,1,"[1,5]","city,outdoor"
3,灰绳市场,王都城外,"奴隶交易中心。",0,2,"[1,4]","city,outdoor,danger"
...
```

**npcs.csv：**

```csv
id,name,race,gender,location_id,description,personality_type
1,沈清岚,人类,女,10,短发女同学...,rational
2,格兰,亚人,男,10,亚人猎人...,pragmatic
...
```

**items.csv：**

```csv
id,name,type,weight,description,base_buy_price,base_sell_price
1,短刀,weapon,1,普通短刀,15,8
2,皮甲,armor,3,轻便皮甲,30,18
3,药草,material,0.1,野生药草,3,1
...
```

### 7.5 数据库初始化脚本

```typescript
// apps/api/src/data/loader.ts
// 读取 CSV → Prisma createMany → SQLite

import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function loadCsv<T>(filename: string, transform: (row: any) => T): Promise<T[]> {
  const csvPath = path.join(__dirname, '../../data', filename)
  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',')

  return lines.slice(1).map(line => {
    const values = line.split(',')
    const row: any = {}
    headers.forEach((h, i) => { row[h.trim()] = values[i]?.trim() })
    return transform(row)
  })
}

async function loadAll() {
  // 加载地点
  const locations = await loadCsv('locations.csv', row => ({
    id: Number(row.id), name: row.name, region: row.region,
    description: row.description, isSafe: row.is_safe === '1',
    travelCost: Number(row.travel_cost),
    connectedLocations: row.connected_locations,
    specialTags: row.tags,
  }))
  await prisma.location.createMany({ data: locations })

  // 加载 NPC → Character + Npc
  // ...

  console.log('✅ Data loaded from CSV')
}

loadAll()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect() })
```

### 7.6 package.json scripts

```json
{
  "scripts": {
    "db:load": "ts-node src/data/loader.ts",
    "db:reset": "rm -f data/gray-hill.db && pnpm db:load",
    "dev": "pnpm db:load && nest start --watch"
  }
}
```

> `pnpm dev` 会自动先加载 CSV 再启动服务器。

1. **WAL 模式**：Prisma 默认对 SQLite 启用 WAL
2. **不支持枚举**：SQLite 没有枚举类型，Prisma 中用 `String` 代替 `enum`
3. **JSON 字段**：Prisma 不支持 SQLite 的 `Json` 类型，使用 `String` 存储 JSON 字符串，代码中 `JSON.parse()` / `JSON.stringify()` 转换
4. **不支持 `@default(autoincrement())` 在关系主键上**：`Player` 和 `Npc` 的 `characterId` 不自增，而是引用 `Character.id`
5. **迁移**：开发阶段用 `prisma db push` 快速同步，正式用 `prisma migrate dev`
