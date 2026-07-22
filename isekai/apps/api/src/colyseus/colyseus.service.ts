import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { defineServer, defineRoom } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { GameRoom } from './game.room'

@Injectable()
export class ColyseusService implements OnModuleDestroy {
  private server = defineServer({
    transport: new WebSocketTransport({ pingInterval: 10000 }),
    rooms: {
      game: defineRoom(GameRoom).enableRealtimeListing(),
    },
  })

  constructor() {
    this.server.listen(2567)
    console.log('[Colyseus] ws://localhost:2567')
  }

  async onModuleDestroy() {
    await this.server.gracefullyShutdown()
  }
}
