import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GameService } from './game.service.js';
import { NewGameDto, ActDto } from './dto/game.dto.js';

@Controller('game')
export class GameController {
  constructor(private readonly game: GameService) {}

  /** POST /api/game — 创建新游戏 */
  @Post()
  create(@Body() dto: NewGameDto) {
    return this.game.createNewGame({
      name: dto.name,
      difficulty: dto.difficulty,
      populationScale: dto.populationScale,
      seed: dto.seed,
    });
  }

  /** GET /api/game/:id — 获取游戏状态 */
  @Get(':id')
  getState(@Param('id') id: string) {
    return this.game.getGameState(id);
  }

  /** GET /api/game/:id/actions — 获取可用行动 */
  @Get(':id/actions')
  getActions(@Param('id') id: string) {
    return this.game.getAvailableActions(id);
  }

  /** POST /api/game/:id/act — 执行行动 */
  @Post(':id/act')
  act(@Param('id') id: string, @Body() dto: ActDto) {
    return this.game.executeAction(id, dto);
  }

  /** GET /api/game/:id/log — 获取完整日志 */
  @Get(':id/log')
  getLog(@Param('id') id: string) {
    return this.game.getGameLog(id);
  }
}
