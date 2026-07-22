# 经济/交易系统设计

> 价格体系、交易门控、物价波动、以物易物

---

## 一、核心设计：交易是行动的一种

```
玩家选择 [交易] 购买粮食
  ├── 系统根据当前价格计算花费
  ├── 扣除银币，获得物品
  └── 叙事："你用 {price} 银币买了一袋粮食。"
```

交易走常规行动门控——有商人才能交易、有银币才能买。

---

## 二、价格体系

### 2.1 基础价格

```typescript
interface PriceDef {
  itemId: string
  /** 基础买入价 */
  baseBuyPrice: number
  /** 基础卖出价（通常 = 买入价 × 0.5~0.7） */
  baseSellPrice: number
  /** 稀缺度（影响物价波动幅度） */
  rarity: 'common' | 'uncommon' | 'rare' | 'unique'
}
```

### 2.2 动态价格

```typescript
function getCurrentPrice(
  itemId: string,
  merchant: Merchant,
  ctx: TurnContext,
): { buyPrice: number; sellPrice: number } {
  let buyPrice = PRICE_DEFS[itemId].baseBuyPrice

  // 1. 商人加成
  buyPrice = Math.floor(buyPrice * merchant.priceModifier)

  // 2. 声望修正
  if (ctx.reputation >= 30) buyPrice = Math.floor(buyPrice * 0.9)
  if (ctx.reputation >= 60) buyPrice = Math.floor(buyPrice * 0.8)

  // 3. 交涉技能修正
  if (ctx.skills.negotiation) {
    buyPrice = Math.floor(buyPrice * (1 - ctx.skills.negotiation.level * 0.05))
  }

  // 4. 物价波动（来自事件系统）
  const fluctuation = ctx.marketPrices.get(itemId) ?? 0
  buyPrice = Math.floor(buyPrice * (1 + fluctuation))

  return {
    buyPrice: Math.max(1, buyPrice),
    sellPrice: Math.max(1, Math.floor(buyPrice * 0.6)),
  }
}
```

### 2.3 物价波动事件

```typescript
// 事件 T-007 物价波动的效果
const priceFluctuationEffect: EventEffect = {
  type: 'modifyPrice',
  params: {
    itemId: 'food',
    change: 0.3,         // 涨价 30%
    duration: 10,        // 持续 10 回合
  },
}
```

---

## 三、商人

```typescript
interface Merchant {
  id: number
  npcId: number
  name: string

  /** 价格修正（1.0 = 标准价） */
  priceModifier: number

  /** 出售的物品列表 */
  sells: Array<{
    itemId: string
    /** 库存数量（-1 = 无限） */
    stock: number
    /** 是否限量 */
    limited: boolean
    /** 补货回合数 */
    restockTurns: number
  }>

  /** 收购的物品列表 */
  buys: string[]

  /** 专属规则 */
  rules?: Rule[]
}

const MERCHANTS: Merchant[] = [
  {
    id: 1,
    npcId: 8,          // 罗德里克（暮河镇药材商）
    name: '罗德里克',
    priceModifier: 1.2, // 奸商——比标准价贵 20%
    sells: [
      { itemId: 'food', stock: 30, limited: true, restockTurns: 10 },
      { itemId: 'herb', stock: 15, limited: true, restockTurns: 5 },
      { itemId: 'bandage', stock: 5, limited: true, restockTurns: 15 },
    ],
    buys: ['wood', 'stone', 'animal_pelt'],
    rules: [
      {  /* 信誉差 → 价格更高 */ },
    ],
  },
]
```

---

## 四、交易门控

```typescript
function getTradeActions(location: Location, ctx: TurnContext): TradeAction[] {
  const actions: TradeAction[] = []

  for (const merchant of getMerchantsAtLocation(location.id)) {
    // 有商人吗？
    if (!merchant) continue

    // 商人在吗？（可能离开了/被抓了/不在了）
    if (!isMerchantAvailable(merchant, ctx)) continue

    // 好感度够吗？（有的商人讨厌你就不卖）
    if (merchant.minAffection && ctx.affection < merchant.minAffection) continue

    actions.push({
      id: `trade_${merchant.id}`,
      label: `和${merchant.name}交易`,
      merchant,
    })
  }

  return actions
}
```

---

## 五、以物易物

不是所有交易都用银币。偏远地区可能不接受银币：

```typescript
interface BarterOption {
  offerItemId: string     // 玩家给出的物品
  offerQuantity: number
  wantItemId: string      // 玩家想换到的物品
  wantQuantity: number
  /** NPC 是否接受此交易 */
  isAccepted: (ctx: TurnContext) => boolean
}
```

---

## 六、代码结构

```
apps/api/src/engine/economy/
├── economy.types.ts          # PriceDef, Merchant 等
├── pricing.ts                # 动态价格计算
├── merchants.ts              # 商人数据
├── trade-gate.ts             # 交易门控
├── barter.ts                 # 以物易物
└── price-events.ts           # 物价波动事件
```
