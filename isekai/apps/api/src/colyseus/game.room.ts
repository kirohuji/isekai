import { Room, Client } from 'colyseus'
import { GameState, Player } from './game.state'
import { TurnManager } from '../engine/turn/turn-manager'
import { BUILTIN_ACTIONS } from '../engine/actions/builtin-actions'
import { Season, Weather, getSeason } from '../engine/types'

/**
 * Colyseus 游戏房间
 *
 * 回合制文字冒险游戏的核心房间。
 * 集成 TurnManager + 门控引擎 + 规则系统。
 */
export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 8
  private turnManager = new TurnManager()

  onCreate(_options: any) {
    this.setState(new GameState())
    console.log('[GameRoom] created:', this.roomId)

    this.turnManager.initialize({
      playerName: '旅者',
      locationId: 10,
      weather: Weather.晴朗,
      season: getSeason(9),
    })
    this.turnManager.registerActions(BUILTIN_ACTIONS)

    // 玩家选择了行动
    this.onMessage('action', (client, data: { actionId: string; customInput?: string }) => {
      console.log(`[GameRoom] action from ${client.sessionId}:`, data)

      // 用 TurnManager 执行完整回合
      const result = this.turnManager.executeTurn(data.actionId, data.customInput)

      // 推送叙事 + 行动列表（消息通道）
      this.broadcast('narrative', { text: result.narrative, turn: result.state.turn })
      this.broadcast('actions', result.actions)

      // 更新 Colyseus 结构化状态
      this.state.location = result.state.location
      this.state.region = result.state.region
      this.state.dateDisplay = result.state.dateDisplay
      this.state.timeBlock = result.state.timeBlock
      this.state.turn = result.state.turn
      this.state.isPlayerTurn = result.isPlayerTurn

      // 更新玩家状态
      const playerSchema = this.state.players.get(client.sessionId)
      if (playerSchema) {
        playerSchema.hp = result.state.hp
        playerSchema.maxHp = result.state.maxHp
        playerSchema.sp = result.state.sp
        playerSchema.maxSp = result.state.maxSp
        playerSchema.mp = result.state.mp
        playerSchema.maxMp = result.state.maxMp
        playerSchema.silver = result.state.silver
      }
    })
  }

  onJoin(client: Client) {
    console.log('[GameRoom] join:', client.sessionId)
    const player = new Player()
    player.sessionId = client.sessionId
    player.name = '旅者'
    this.state.players.set(client.sessionId, player)

    // 新玩家加入时，发送初始叙事
    setTimeout(() => {
      this.pushNarrative('你站在灰丘的高地上。面前是一间半塌的石基木屋，和一个塌了大半的储藏坑。\n\n风吹过荒地，带着几分秋日的凉意。远处的苇水村升起炊烟——但他们也知道，粮食撑不了太久了。\n\n你必须想办法让所有人活下去。')
      this.pushActions([
        { id: 'rest', title: '休息', description: '恢复 HP 和 SP', category: 'rest' },
        { id: 'explore', title: '探索周边', description: '消耗 15 SP', category: '探索' },
        { id: 'talk', title: '交谈', description: '消耗 5 SP', category: '社交' },
        { id: 'move', title: '前往下个地点', description: '消耗 10 SP', category: '移动' },
      ])
    }, 500)
  }

  onLeave(client: Client) {
    console.log('[GameRoom] leave:', client.sessionId)
    this.state.players.delete(client.sessionId)
  }

  onDispose() {
    console.log('[GameRoom] disposed:', this.roomId)
  }

  pushNarrative(text: string): void {
    this.broadcast('narrative', { text, turn: this.state.turn })
  }

  pushNarrativeUpdate(text: string): void {
    this.broadcast('narrative_update', { text })
  }

  pushActions(actions: any[]): void {
    this.broadcast('actions', actions)
  }
}
