import { IsString, IsIn, IsOptional, MinLength, MaxLength } from 'class-validator';
import type { Difficulty, PopulationScale, ActionKind } from '@gray-hill/engine';

export class NewGameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(24)
  name: string = '未命名旅者';

  @IsIn(['story', 'survival', 'doom'])
  difficulty: Difficulty = 'survival';

  @IsIn(['small', 'medium', 'large'])
  populationScale: PopulationScale = 'small';

  @IsOptional()
  @IsString()
  seed?: string;
}

export class ActDto {
  @IsIn(['move', 'rest', 'work', 'explore', 'socialize', 'build', 'trade', 'combat', 'scout', 'hunt', 'gather', 'craft', 'study', 'pray', 'wait'])
  kind!: ActionKind;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  label?: string;
}
