import { Module } from '@nestjs/common'
import { GameModule } from './game/game.module'
import { ColyseusModule } from './colyseus/colyseus.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [GameModule, ColyseusModule, PrismaModule],
})
export class AppModule {}
