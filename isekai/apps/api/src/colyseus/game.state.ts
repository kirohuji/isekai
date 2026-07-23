import { Schema, type, MapSchema } from '@colyseus/schema'

/**
 * Colyseus Schema — 只同步结构化状态
 *
 * 叙事文本和行动列表不走 Schema 全量同步，
 * 通过 room.send('narrative', text) / room.send('actions', [])
 * 消息通道推送，避免长文本频繁编码/解码。
 */
export class Player extends Schema {
  @type('string') sessionId: string = ''
  @type('string') name: string = ''
  @type('number') hp: number = 100
  @type('number') maxHp: number = 100
  @type('number') sp: number = 100
  @type('number') maxSp: number = 100
  @type('number') mp: number = 100
  @type('number') maxMp: number = 100
  @type('number') silver: number = 120
}

/** 房间状态 — 仅结构化数据 */
export class GameState extends Schema {
  @type('string') location: string = '王都·召唤广场'
  @type('string') region: string = '王都神殿区'
  @type('string') dateDisplay: string = '光明历847年 三月 第1天'
  @type('string') timeBlock: string = '上午'
  @type('number') turn: number = 0

  @type({ map: Player }) players = new MapSchema<Player>()
  @type('boolean') isPlayerTurn: boolean = false

  // 注意: narrative 和 availableActions 不走 Schema
  // 通过 room.send('narrative') / room.send('actions') 推送
}
