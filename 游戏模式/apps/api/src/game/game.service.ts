import { Injectable, NotFoundException } from '@nestjs/common';
import { createWorld, resolveTurn, generateNpcIntents } from '@gray-hill/engine';
import type { WorldState, Intent, NpcDecision, TurnResolution, Difficulty, PopulationScale } from '@gray-hill/engine';
import { createRng, pick } from '@gray-hill/engine';
import { DatabaseService } from './database.service.js';
import { NarrativeService } from './narrative.service.js';

@Injectable()
export class GameService {
  constructor(
    private readonly db: DatabaseService,
    private readonly narrative: NarrativeService,
  ) {}

  /** 创建新游戏 */
  createNewGame(input: { name: string; difficulty: Difficulty; populationScale: PopulationScale; seed?: string }) {
    const seed = input.seed ? parseInt(input.seed, 36) : Math.floor(Math.random() * 2 ** 31);
    const world = createWorld({
      playerName: input.name,
      difficulty: input.difficulty,
      populationScale: input.populationScale,
      seed,
    });

    this.db.saveGame(world.gameId, world, input.name, input.difficulty, input.populationScale);

    // 生成开局叙事
    const openingNarrative = this.generateOpeningNarrative(world);
    this.db.saveNarrative(
      world.gameId, 0, 1, 'morning', 'player',
      openingNarrative.body, openingNarrative.mood,
      openingNarrative.facts, [],
    );

    return this.buildGameResponse(world);
  }

  /** 获取游戏状态 */
  getGameState(gameId: string) {
    const data = this.db.loadGame(gameId);
    if (!data) throw new NotFoundException('存档不存在');
    return this.buildGameResponse(data.state);
  }

  /** 获取可用行动 */
  getAvailableActions(gameId: string) {
    const data = this.db.loadGame(gameId);
    if (!data) throw new NotFoundException('存档不存在');
    const player = data.state.characters.find(c => c.id === data.state.playerId)!;
    if (!player.alive) {
      return { actions: [], round: data.state.round, playerDead: true };
    }
    return {
      actions: this.narrative.generateActions(data.state),
      round: data.state.round,
      playerDead: false,
    };
  }

  /** 执行玩家行动 */
  executeAction(gameId: string, input: Omit<Intent, 'actorId'>) {
    const data = this.db.loadGame(gameId);
    if (!data) throw new NotFoundException('存档不存在');

    const world = data.state;
    const player = world.characters.find(c => c.id === world.playerId)!;
    if (!player.alive) throw new NotFoundException('该角色已经死亡');

    // 构建玩家意图
    const playerIntent: Intent = {
      actorId: world.playerId,
      kind: input.kind,
      targetId: input.targetId,
      detail: input.detail,
      label: input.label ?? `执行${input.kind}`,
    };

    // AI辅助生成核心NPC决策（当前用随机代替，未来接LLM）
    const npcDecisions: NpcDecision[] = this.generateNpcDecisions(world);

    // 执行回合结算
    const resolution: TurnResolution = resolveTurn(
      world,
      playerIntent,
      npcDecisions,
      Math.floor(npcDecisions.length * 0.5), // 一半AI辅助
    );

    // 持久化
    this.db.saveGame(
      world.gameId,
      resolution.state,
      data.meta.playerName,
      data.meta.difficulty,
      data.meta.populationScale,
    );
    this.db.saveEvents(world.gameId, resolution.events);
    this.db.saveAction(
      world.gameId, resolution.state.round, player.id, player.name,
      playerIntent, `执行了${playerIntent.label}`,
    );
    if (resolution.deaths.length > 0) {
      this.db.saveDeaths(world.gameId, resolution.deaths);
    }

    // 每10回合保存快照
    if (resolution.state.round % 10 === 0) {
      this.db.saveSnapshot(world.gameId, resolution.state.round, resolution.state);
    }

    // 生成叙事
    const narration = this.narrative.generateNarrative(resolution.state, playerIntent, resolution);
    this.db.saveNarrative(
      world.gameId, resolution.state.round, resolution.state.day,
      resolution.state.phase, 'player',
      narration.body, narration.mood,
      narration.facts, [],
    );

    return this.buildGameResponse(resolution.state);
  }

  /** 获取完整日志 */
  getGameLog(gameId: string) {
    // 确保游戏存在
    const data = this.db.loadGame(gameId);
    if (!data) throw new NotFoundException('存档不存在');
    return this.db.getFullLog(gameId);
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private buildGameResponse(world: WorldState) {
    const player = world.characters.find(c => c.id === world.playerId)!;
    const location = world.locations.find(l => l.id === player.locationId);
    const recentNarrative = this.db.getRecentNarrative(world.gameId);
    
    // 同地点角色
    const nearbyCharacters = world.characters.filter(
      c => c.alive && c.locationId === player.locationId && c.id !== player.id
    );
    
    // 关键统计
    const aliveCore = world.characters.filter(c => c.alive && c.isCore).length;
    const totalCore = world.characters.filter(c => c.isCore).length;
    
    return {
      gameId: world.gameId,
      round: world.round,
      day: world.day,
      phase: world.phase,
      difficulty: world.difficulty,
      populationScale: world.populationScale,
      redMoonCountdown: world.redMoonCountdown,
      player: {
        id: player.id,
        name: player.name,
        alive: player.alive,
        health: player.health,
        maxHealth: player.maxHealth,
        mental: player.mental,
        maxMental: player.maxMental,
        stamina: player.stamina,
        maxStamina: player.maxStamina,
        hunger: player.hunger,
        combat: player.combat,
        defense: player.defense,
        agility: player.agility,
        gold: player.gold,
        attributes: player.attributes,
        skills: player.skills,
        statusEffects: player.statusEffects,
      },
      location: location ? {
        id: location.id,
        name: location.name,
        region: location.region,
        description: location.description,
        isSafe: location.isSafe,
        population: location.population,
        connectedLocations: location.connectedLocations,
      } : null,
      nearbyCharacters: nearbyCharacters.slice(0, 10).map(c => ({
        id: c.id,
        name: c.name,
        race: c.race,
        isCore: c.isCore,
        combat: c.combat,
      })),
      stats: {
        aliveCore,
        totalCore,
        totalFactions: world.factions.length,
        totalLocations: world.locations.length,
        globalStability: world.globalStability,
        globalFood: world.globalFood,
      },
      recentNarrative: recentNarrative ? {
        body: recentNarrative.body,
        mood: recentNarrative.mood,
      } : null,
      actions: this.narrative.generateActions(world),
    };
  }

  /**
   * 为核心NPC生成决策
   * 当前使用规则+随机，未来可接入LLM做真正的AI决策
   */
  private generateNpcDecisions(world: WorldState): NpcDecision[] {
    const rng = createRng(world.seed + world.round * 997);
    const coreNpcs = world.characters.filter(c => c.alive && !c.isPlayer && c.isCore);
    const decisions: NpcDecision[] = [];

    for (const npc of coreNpcs) {
      // 低体力 → 休息
      if (npc.stamina < 20) {
        decisions.push({
          characterId: npc.id,
          intent: { actorId: npc.id, kind: 'rest', label: '体力不足，原地休整' },
          reasoning: '体力过低，需要休息',
          aiGuided: true,
        });
        continue;
      }

      // 高饥饿 → 狩猎/采集
      if (npc.hunger > 70) {
        const kind = pick(['hunt', 'gather'] as const, rng);
        decisions.push({
          characterId: npc.id,
          intent: { actorId: npc.id, kind, label: '饥饿难耐，外出觅食' },
          reasoning: '饥饿值过高，需要寻找食物',
          aiGuided: true,
        });
        continue;
      }

      // 根据势力类型和角色属性决定行动
      const faction = world.factions.find(f => f.id === npc.factionId);
      if (faction?.type === 'bandit' && rng() < 0.3) {
        // 盗贼有概率劫掠
        const targets = world.characters.filter(c => c.alive && c.id !== npc.id && c.locationId === npc.locationId);
        if (targets.length > 0) {
          const target = pick(targets, rng);
          decisions.push({
            characterId: npc.id,
            intent: { actorId: npc.id, kind: 'combat', targetId: target.id, label: `袭击${target.name}` },
            reasoning: '盗贼倾向劫掠弱者',
            aiGuided: true,
          });
          continue;
        }
      }

      // 商人倾向交易
      if (faction?.type === 'merchant' && rng() < 0.5) {
        decisions.push({
          characterId: npc.id,
          intent: { actorId: npc.id, kind: 'trade', label: '进行商业活动' },
          reasoning: '商人倾向交易',
          aiGuided: true,
        });
        continue;
      }

      // 默认：随机行动（一半概率让AI指导）
      const kinds = ['work', 'explore', 'socialize', 'rest', 'scout', 'wait'] as const;
      decisions.push({
        characterId: npc.id,
        intent: { actorId: npc.id, kind: pick(kinds, rng), label: '按自身计划行动' },
        reasoning: rng() > 0.5 ? '根据当前局势判断的最佳行动' : '随机决定',
        aiGuided: rng() > 0.5,
      });
    }

    return decisions;
  }

  /**
   * 生成开局叙事
   */
  private generateOpeningNarrative(world: WorldState): { body: string; mood: string; facts: string[] } {
    const player = world.characters.find(c => c.id === world.playerId)!;
    const loc = world.locations.find(l => l.id === player.locationId);
    const diffLabel = world.difficulty === 'story' ? '故事模式' : world.difficulty === 'survival' ? '生存模式' : '末日模式';
    const popDesc = world.populationScale === 'small' ? '500万人的小王国' : world.populationScale === 'medium' ? '1000万人的中等王国' : '2000万人的大王国';
    
    const body = [
      `光。`,
      ``,
      `你睁开眼睛的第一秒，看到的是一片刺眼的白。`,
      ``,
      `不是学校的天花板。不是寝室的窗帘。是石头——穹顶上密密麻麻的符文，亮得像烧红的铁丝。空气里有烧灼金属的味道。`,
      ``,
      `你站在${loc?.name ?? '召唤广场'}的圆形大厅里。周围是穿着同样校服的同学——有人在哭，有人在大喊，有人还闭着眼睛。`,
      ``,
      `一个穿灰袍的人走到你面前。他的眼睛没有看你——他在衡量你。`,
      ``,
      `"无能力者。"他说。`,
      ``,
      `一块木牌被塞进你手里。120枚银币的安置金。还有一行你不认识的文字。`,
      ``,
      `这是${popDesc}。这是光明历847年。这是你的异世界生存。`,
      ``,
      `难度：${diffLabel}`,
      ``,
      `[第1回合开始。选择你的行动。]`,
    ].join('\n');

    return { body, mood: 'mysterious', facts: ['主角被召唤到异世界', '获得120银币安置金', `所在世界：${popDesc}`, `难度：${diffLabel}`] };
  }
}
