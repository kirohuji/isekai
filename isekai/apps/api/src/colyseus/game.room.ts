import { Room, Client } from 'colyseus'
import { GameState } from './game.state'

/**
 * Colyseus 游戏房间
 *
 * 叙事文本和行动列表不走 Schema 同步（避免长文本全量编码），
 * 通过 room.send('narrative') / room.send('actions') 消息推送。
 */
export class GameRoom extends Room<GameState> {
  maxClients = 8

  onCreate(_options: any) {
    this.setState(new GameState())
    console.log('[GameRoom] created:', this.roomId)

    this.onMessage('action', (client, data) => {
      console.log(`[GameRoom] action from ${client.sessionId}:`, data)
    })
  }

  onJoin(client: Client) {
    console.log('[GameRoom] join:', client.sessionId)
  }

  onLeave(client: Client) {
    console.log('[GameRoom] leave:', client.sessionId)
  }

  onDispose() {
    console.log('[GameRoom] disposed:', this.roomId)
  }

  /** 推送叙事文本（不走 Schema，通过消息通道） */
  pushNarrative(text: string): void {
    this.broadcast('narrative', { text, turn: this.state.turn })
  }

  /** 推送增量润色（AI 异步返回后调用） */
  pushNarrativeUpdate(text: string): void {
    this.broadcast('narrative_update', { text })
  }

  /** 推送行动列表 */
  pushActions(actions: string[]): void {
    this.broadcast('actions', actions)
  }
}
