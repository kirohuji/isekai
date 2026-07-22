import { Module } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { GameService } from './game.service.js';
import { DatabaseService } from './database.service.js';
import { NarrativeService } from './narrative.service.js';

@Module({
  controllers: [GameController],
  providers: [GameService, DatabaseService, NarrativeService],
  exports: [GameService, DatabaseService],
})
export class GameModule {}
