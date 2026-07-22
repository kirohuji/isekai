import { Module } from '@nestjs/common';
import { GameController } from './game.controller.js';
import { GameService } from './game.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AIService } from '../ai/ai.service.js';

@Module({
  controllers: [GameController],
  providers: [GameService, DatabaseService, AIService],
  exports: [GameService],
})
export class GameModule {}
