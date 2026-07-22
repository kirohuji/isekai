import { IsString, IsIn, IsOptional, MinLength, MaxLength } from 'class-validator';
import type { Difficulty, PopulationScale, ActionKind } from '@gray-hill/engine';

/** 主角职业背景 ID */
export const OCCUPATION_IDS = [
  'student', 'accounting', 'debateteam', 'medstudent', 'athlete',
  'programmer', 'farmkid', 'delinquent', 'bookworm', 'chef', 'artist', 'orphan',
] as const;

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
  @IsIn(OCCUPATION_IDS)
  occupation?: string;

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
