# 存档系统设计

> 存档内容、触发时机、存储格式、读档流程

---

## 一、存档内容

一个存档 = 游戏状态的完整快照

```typescript
interface SaveData {
  meta: SaveMeta
  gameState: {
    // 时间
    year: number; month: number; day: number
    timeBlock: string; turnCount: number

    // 玩家（含 character + player）
    player: {
      characterId: number
      name: string; gender: string
      hp: number; sp: number; mp: number
      silver: number; copper: number; foodDays: number
      personality: PersonalityProfile
      psychologicalState: PsychologicalState
      statusEffects: StatusEffect[]
    }

    // 位置
    locationId: number
    locationStates: Record<number, LocationState>

    // 背包
    inventory: InventoryItem[]

    // 装备
    equipment: EquipSlots

    // 技能
    skills: SkillState[]

    // 关系
    relationships: Relationship[]
    reputations: Reputation[]

    // 标记
    persistentFlags: Record<string, string>

    // 事件
    eventCooldowns: Record<number, number>
    pendingChains: PendingChain[]

    // 任务
    quests: QuestState[]

    // 天气
    weather: WeatherState
  }
}

interface SaveMeta {
  slotId: number
  timestamp: string
  turnCount: number
  locationName: string
  description: string
  version: string       // 存档格式版本，用于兼容检查
}
```

---

## 二、触发时机

```typescript
const SAVE_TRIGGERS = {
  /** 跨天时自动存档 */
  onDayPass: true,
  /** 重大剧情事件后 */
  onMajorEvent: true,
  /** 战斗后 */
  onCombatEnd: true,
  /** 任务完成 */
  onQuestComplete: true,
  /** 进入新地点 */
  onLocationEnter: true,
  /** 玩家主动存档 */
  onPlayerRequest: true,
}
```

### 自动存档的限频

```typescript
class AutoSaveManager {
  private lastSaveTurn: number = 0
  private readonly MIN_SAVE_INTERVAL = 5  // 至少间隔 5 回合

  shouldAutoSave(ctx: TurnContext): boolean {
    if (ctx.turn - this.lastSaveTurn < MIN_SAVE_INTERVAL) return false
    if (ctx.hasMajorEvent) return true
    if (ctx.dayChanged) return true
    return false
  }
}
```

---

## 三、后端实现

### 3.1 存储

存档存在 SQLite 的 `saves` 表中：

```prisma
model Save {
  id          Int    @id @default(autoincrement())
  slotId      Int
  data        String   // JSON 序列化的 SaveData
  version     String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([slotId])
}
```

### 3.2 API

```typescript
@Controller('game')
export class GameController {
  @Post('save')
  async save(@Body() body: { slotId: number }): Promise<{ success: boolean }> {
    // 从当前 Colyseus room 获取状态
    // 序列化为 SaveData
    // 写入 saves 表
  }

  @Get('saves')
  async listSaves(): Promise<SaveMeta[]> {
    // 返回所有存档的元数据（不含完整数据）
  }

  @Post('load')
  async load(@Body() body: { slotId: number }): Promise<SaveData> {
    // 读取存档
    // 恢复游戏状态
  }
}
```

---

## 四、前端

```typescript
// 存档/读档界面在 GameScreen 中以 modal 形式展示
interface SaveUI {
  slots: Array<{
    id: number
    meta: SaveMeta
    isEmpty: boolean
  }>
  onSave: (slotId: number) => void
  onLoad: (slotId: number) => void
  onDelete: (slotId: number) => void
}
```

---

## 五、代码结构

```
apps/api/src/save/
├── save.module.ts
├── save.controller.ts        # REST: save/load/list
├── save.service.ts            # 存档/读档逻辑
├── save.serializer.ts         # GameState → SaveData 序列化
└── save.deserializer.ts       # SaveData → GameState 反序列化
```
