import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GameService } from './game.service.js';
import { NewGameDto, ActDto } from './dto/game.dto.js';

@Controller('game')
export class GameController {
  constructor(private readonly game: GameService) {}

  @Post() create(@Body() dto: NewGameDto) {
    return this.game.createNewGame({ name: dto.name, difficulty: dto.difficulty, populationScale: dto.populationScale, occupation: dto.occupation, seed: dto.seed });
  }
  @Get(':id') getState(@Param('id') id: string) { return this.game.getGameState(id); }
  @Get(':id/actions') getActions(@Param('id') id: string) { return this.game.getAvailableActions(id); }
  @Post(':id/act') act(@Param('id') id: string, @Body() dto: ActDto) { return this.game.executeAction(id, dto); }
  @Get(':id/log') getLog(@Param('id') id: string) { return this.game.getGameLog(id); }

  // 角色详情
  @Get(':id/character/:cid') getCharacter(@Param('id') id: string, @Param('cid') cid: string) { return this.game.getCharacterDetail(id, cid); }

  // 队伍
  @Post(':id/party/join') partyJoin(@Param('id') id: string, @Body() body: { characterId: string; role?: string }) { return this.game.partyJoin(id, body.characterId, body.role); }
  @Post(':id/party/leave') partyLeave(@Param('id') id: string, @Body() body: { characterId: string }) { return this.game.partyLeave(id, body.characterId); }

  // 资产
  @Get(':id/assets') getAssets(@Param('id') id: string) { return this.game.getAssets(id); }
  @Get(':id/employments') getEmployments(@Param('id') id: string) { return this.game.getEmployments(id); }
  @Post(':id/employ') employ(@Param('id') id: string, @Body() body: { characterId: string; role: string; salary: number }) { return this.game.employCharacter(id, body.characterId, body.role, body.salary); }

  // 奴隶
  @Get(':id/slaves') getSlaves(@Param('id') id: string) { return this.game.getSlaves(id); }
  @Post(':id/enslave') enslave(@Param('id') id: string, @Body() body: { characterId: string; slaveType: string }) { return this.game.enslaveCharacter(id, body.characterId, body.slaveType); }
  @Post(':id/slave/interact') slaveInteract(@Param('id') id: string, @Body() body: { characterId: string }) { return this.game.slaveNightInteract(id, body.characterId); }

  // 情报
  @Get(':id/intel') getIntel(@Param('id') id: string) { return this.game.getIntelList(id); }

  // 关系
  @Get(':id/relationships') getRelationships(@Param('id') id: string) { return this.game.getRelationshipList(id); }

  // 背包
  @Get(':id/inventory') getInventory(@Param('id') id: string) { return this.game.getInventoryList(id); }

  // 任务
  @Get(':id/quests') getQuests(@Param('id') id: string) { return this.game.getQuestList(id); }
}
