import { Injectable, NotFoundException } from '@nestjs/common';
import { createWorld, resolveTurn } from '@gray-hill/engine';
import type { WorldState, Intent, NpcDecision, Difficulty, PopulationScale, Rule, ActionKind } from '@gray-hill/engine';
import { createRng, pick } from '@gray-hill/engine';
import { DatabaseService } from '../database/database.service.js';
import { AIService, PROTAGONIST_OCCUPATIONS } from '../ai/ai.service.js';
import type { NarrativeContext, ActionContext, NpcDecisionContext, WorldSeedContext, WorldReviewContext, WorldReviewResult, RuleSuggestion } from '../ai/ai.service.js';
import { inferLocationType, type RuleCondition, type RuleEffect } from '@gray-hill/engine';

@Injectable()
export class GameService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AIService,
  ) {}

  /** 创建新游戏 */
  async createNewGame(input: { name: string; difficulty: Difficulty; populationScale: PopulationScale; occupation?: string; seed?: string }) {
    const seed = input.seed ? parseInt(input.seed, 36) : Math.floor(Math.random() * 2 ** 31);
    const world = createWorld({
      playerName: input.name,
      difficulty: input.difficulty,
      populationScale: input.populationScale,
      seed,
    });

    // 应用主角职业
    const occ = PROTAGONIST_OCCUPATIONS.find(o => o.id === (input.occupation ?? 'student')) ?? PROTAGONIST_OCCUPATIONS[0];
    const player = world.characters.find(c => c.id === world.playerId)!;
    player.attributes = { ...player.attributes, ...occ.attributeBonus };
    player.gold += occ.startingGoldBonus;
    // 合并技能（去重）
    for (const sk of occ.startingSkills) {
      if (!player.skills.some(s => s.name === sk)) {
        player.skills.push({ name: sk, level: 2, experience: 0 });
      }
    }

    // AI生成世界随机种子
    const popConfig = { small: '500万', medium: '1000万', large: '2000万' }[input.populationScale];
    const loc = world.locations.find(l => l.id === player.locationId);
    const seedCtx: WorldSeedContext = {
      populationScale: input.populationScale,
      totalPop: popConfig,
      difficulty: input.difficulty,
      playerOccupation: occ.name,
      startLocation: loc?.name ?? '召唤广场',
    };
    const worldSeed = await this.ai.generateWorldSeed(seedCtx);

    // AI生成初始规则（天气、地点等上下文规则）
    const initialRules = await this.ai.generateInitialRules({
      locationName: loc?.name ?? '召唤广场',
      locationType: inferLocationType(loc),
      weather: worldSeed.seasonWeather,
      difficulty: input.difficulty,
      playerOccupation: occ.name,
    });
    for (const r of initialRules) {
      world.rules.push({
        id: `rule_init_${world.rules.length}`,
        name: r.name, description: r.description,
        category: r.category as Rule['category'],
        conditions: r.conditions as RuleCondition[],
        effects: r.effects as RuleEffect[],
        duration: r.duration, source: '开局生成',
        priority: r.priority, activeSince: 0, isActive: true,
      });
    }

    // 存储世界种子数据
    this.db.saveGame(world.gameId, world, input.name, input.difficulty, input.populationScale);
    this.db.setFlag(world.gameId, 'world_seed', JSON.stringify(worldSeed));
    this.db.setFlag(world.gameId, 'player_occupation', occ.id);
    this.db.setFlag(world.gameId, 'season_weather', worldSeed.seasonWeather);

    // 开局叙事（融入AI种子数据）
    const openingBody = [
      `光。`,
      ``,
      `你睁开眼睛的第一秒，看到的是一片刺眼的白。`,
      ``,
      `不是学校的天花板。是石头——穹顶上密密麻麻的符文，亮得像烧红的铁丝。`,
      ``,
      `一个穿灰袍的人走到你面前。"无能力者。"他说。`,
      ``,
      `一块木牌被塞进你手里。120枚银币。${loc?.name ?? '召唤广场'}。`,
      ``,
      `你是${occ.name}。${occ.desc}`,
      ``,
      `${worldSeed.seasonWeather}。`,
      ...(worldSeed.rumors.length > 0 ? ['', `街边有人在小声议论：`, ...worldSeed.rumors.map(r => `"${r}"`)] : []),
      ``,
      `[选择你的行动开始。]`,
    ].join('\n');
    this.db.saveNarrative(world.gameId, 0, 1, 'morning', openingBody, 'mysterious',
      ['主角被召唤到异世界', `职业：${occ.name}`, `天气：${worldSeed.seasonWeather}`, ...worldSeed.rumors.map(r => `传闻：${r}`)],
      []);

    return {
      ...this.buildResponse(world),
      worldSeed: {
        rumors: worldSeed.rumors,
        specialPlaces: worldSeed.specialPlaces,
        seasonWeather: worldSeed.seasonWeather,
      },
      occupation: { id: occ.id, name: occ.name, desc: occ.desc },
    };
  }

  /** 获取游戏状态 */
  getGameState(gameId: string) { return this.buildResponse(this.requireGame(gameId)); }

  /** 获取可用行动（常规+AI动态） */
  async getAvailableActions(gameId: string) {
    const world = this.requireGame(gameId);
    const player = world.characters.find(c => c.id === world.playerId)!;
    if (!player.alive) return { regularActions: [], dynamicActions: [], round: world.round, playerDead: true };

    const loc = world.locations.find(l => l.id === player.locationId);
    const regularActions = this.generateDynamicActions(world, player, loc);

    let dynamicActions: Array<{ kind: string; label: string; detail: string; targetId?: string; isAi: boolean }> = [];
    try {
      const nearby = world.characters.filter(c => c.alive && c.locationId === player.locationId && c.id !== player.id);
      const ctx: ActionContext = {
        playerName: player.name,
        playerStats: { health: player.health, stamina: player.stamina, mental: player.mental, hunger: player.hunger },
        attributes: player.attributes,
        locationName: loc?.name ?? '未知',
        locationDesc: loc?.description ?? '',
        isSafe: loc?.isSafe ?? false,
        nearbySummary: nearby.slice(0, 5).map(c => `${c.name}(${c.race},⚔${c.combat})`).join('，') || '无人',
        situationSummary: `第${world.round}回合，第${world.day}天。${world.difficulty}难度。红月倒计时${world.redMoonCountdown}天。`,
      };
      dynamicActions = (await this.ai.generateDynamicActions(ctx)).map(a => ({ ...a, isAi: true }));
    } catch { /* fallback */ }

    return { regularActions, dynamicActions, round: world.round, playerDead: false };
  }

  /** 执行玩家行动 */
  async executeAction(gameId: string, input: Omit<Intent, 'actorId'>) {
    const world = this.requireGame(gameId);
    const player = world.characters.find(c => c.id === world.playerId)!;
    if (!player.alive) throw new NotFoundException('该角色已经死亡');

    const playerIntent: Intent = { actorId: world.playerId, ...input };
    // 同步背包到 world state（供规则引擎条件检查）
    world.inventory = (this.db.getInventory(world.gameId) as unknown as Array<{ id: string; name: string; itemType: string; quantity: number; description: string; value: number; effects?: Record<string, number>; isEquipped: boolean }>).map(i => ({
      id: i.item_id ?? i.id, name: i.name, itemType: i.item_type ?? i.itemType as any, quantity: i.quantity,
      description: i.description ?? '', value: i.value, isEquipped: false,
    }));
    world.quests = (this.db.getQuests(world.gameId) as unknown as Array<{ id: string; name: string; description: string; category: string; status: string; objectives: Array<{ id: string; description: string; type: string; target: string; required: number; current: number; isCompleted: boolean }>; rewards: Record<string, unknown>; acquiredRound: number }>).map(q => ({
      id: q.quest_id ?? q.id, name: q.name, description: q.description ?? '',
      category: (q.category as any) ?? 'side', status: (q.status as any) ?? 'active',
      objectives: q.objectives ?? [], rewards: q.rewards ?? {}, acquiredRound: q.acquired_round ?? world.round,
    }));

    const npcDecisions = await this.generateNpcDecisionsAsync(world);
    const resolution = resolveTurn(world, playerIntent, npcDecisions, Math.floor(npcDecisions.length * 0.5));
    const newWorld = resolution.state;

    this.db.saveGame(world.gameId, newWorld, player.name, world.difficulty, world.populationScale);
    this.db.saveEvents(world.gameId, resolution.events);
    this.db.saveAction(world.gameId, newWorld.round, player.id, player.name, playerIntent, `执行:${playerIntent.label}`, false);
    if (resolution.deaths.length > 0) this.db.saveDeaths(world.gameId, resolution.deaths);
    if (newWorld.round % 10 === 0) this.db.saveSnapshot(world.gameId, newWorld.round, newWorld);

    // 同步背包/任务变化回DB
    this.syncInventoryToDb(world.gameId, newWorld);
    this.syncQuestsToDb(world.gameId, newWorld);

    // 情报自动收集
    this.collectIntelOnAction(newWorld, playerIntent);

    // 每日资产/雇佣结算 + 奴隶机制 + 关系衰减（跨天时）
    if (newWorld.day > world.day) {
      this.settleDailyAssets(newWorld);
      this.settleDailyEmployments(newWorld);
      this.processSlaveDaily(newWorld);
      this.decayRelationships(newWorld);
    }

    const loc = newWorld.locations.find(l => l.id === player.locationId);
    const nearby = newWorld.characters.filter(c => c.alive && c.locationId === player.locationId && c.id !== player.id);
    const narrativeCtx: NarrativeContext = {
      playerName: player.name,
      locationName: loc?.name ?? '未知', locationRegion: loc?.region ?? '',
      day: newWorld.day, phase: newWorld.phase, round: newWorld.round,
      playerStats: { health: player.health, stamina: player.stamina, mental: player.mental, hunger: player.hunger, gold: player.gold },
      events: resolution.playerEvents.slice(0, 8).map(e => e.description),
      nearbyChars: nearby.slice(0, 5).map(c => `${c.name}（${c.race}）`),
      difficulty: newWorld.difficulty, playerAction: playerIntent.label ?? playerIntent.kind,
    };
    const narrative = await this.ai.generateNarrative(narrativeCtx);
    this.db.saveNarrative(world.gameId, newWorld.round, newWorld.day, newWorld.phase, narrative.body, narrative.mood,
      resolution.playerEvents.slice(0, 5).map(e => e.description), []);

    // 每5回合：AI世界回顾 + AI事件触发
    let worldReview: WorldReviewResult | null = null;
    if (newWorld.round > 0 && newWorld.round % 5 === 0) {
      worldReview = await this.runWorldReview(world.gameId, newWorld, player.name);
    }

    // AI事件触发（每次回合都有可能，不限于5回合）
    const eventTrigger = await this.ai.generateEventTrigger({
      round: newWorld.round, day: newWorld.day, phase: newWorld.phase,
      locationName: loc?.name ?? '未知', playerName: player.name,
      recentEvents: resolution.playerEvents.slice(0, 4).map(e => e.description),
    });
    if (eventTrigger) {
      newWorld.rules.push({
        id: `rule_evt_${newWorld.round}`,
        name: eventTrigger.name, description: eventTrigger.description,
        category: 'ai_generated',
        conditions: eventTrigger.conditions as RuleCondition[],
        effects: eventTrigger.effects as RuleEffect[],
        duration: eventTrigger.duration,
        source: 'AI事件触发',
        priority: eventTrigger.priority, activeSince: newWorld.round, isActive: true,
      });
    }

    return this.buildResponse(newWorld, worldReview);
  }

  getGameLog(gameId: string) { this.requireGame(gameId); return this.db.getFullLog(gameId); }

  /** 公开暴露 requireGame 供 controller 使用 */
  requireGame(gameId: string): WorldState {
    const data = this.db.loadGame(gameId);
    if (!data) throw new NotFoundException('存档不存在');
    return data.state as WorldState;
  }

  /** 角色详情 */
  getCharacterDetail(gameId: string, cid: string) {
    const world = this.requireGame(gameId);
    const char = world.characters.find(c => c.id === cid);
    if (!char) throw new NotFoundException('角色不存在');
    const loc = world.locations.find(l => l.id === char.locationId);
    const faction = world.factions.find(f => f.id === char.factionId);
    const partyMember = this.db.getPartyMembers(gameId).find(p => p.character_id === cid);
    const employment = this.db.getEmployments(gameId).find(e => e.employee_id === cid);
    return {
      id: char.id, name: char.name, race: char.race, gender: char.gender,
      isPlayer: char.isPlayer, isCore: char.isCore, alive: char.alive,
      stats: { health: char.health, maxHealth: char.maxHealth, mental: char.mental, maxMental: char.maxMental, stamina: char.stamina, maxStamina: char.maxStamina, hunger: char.hunger },
      combat: { combat: char.combat, defense: char.defense, agility: char.agility },
      attributes: char.attributes,
      skills: char.skills,
      statusEffects: char.statusEffects,
      gold: char.gold,
      location: loc ? { id: loc.id, name: loc.name, region: loc.region } : null,
      faction: faction ? { id: faction.id, name: faction.name } : null,
      party: partyMember ? { role: partyMember.role, joinedRound: partyMember.joined_round } : null,
      employment: employment ? { role: employment.role, salary: employment.salary, loyalty: employment.loyalty } : null,
    };
  }

  /** 加入队伍 */
  partyJoin(gameId: string, characterId: string, role = '成员') {
    const world = this.requireGame(gameId);
    const char = world.characters.find(c => c.id === characterId);
    if (!char) throw new NotFoundException('角色不存在');
    this.db.addPartyMember(gameId, characterId, char.name, role, world.round);
    char.partyRole = role === '队长' ? 'leader' : 'member';
    this.db.saveGame(gameId, world, '', world.difficulty, world.populationScale);
    return { success: true, party: this.db.getPartyMembers(gameId) };
  }

  /** 离开队伍 */
  partyLeave(gameId: string, characterId: string) {
    const world = this.requireGame(gameId);
    const char = world.characters.find(c => c.id === characterId);
    if (char) char.partyRole = 'none';
    this.db.removePartyMember(gameId, characterId);
    this.db.saveGame(gameId, world, '', world.difficulty, world.populationScale);
    return { success: true, party: this.db.getPartyMembers(gameId) };
  }

  /** 获取资产列表 */
  getAssets(gameId: string) {
    this.requireGame(gameId);
    const rows = this.db.getAssets(gameId);
    const totalDailyIncome = rows.reduce((s, r) => s + (r.is_active ? r.daily_income : 0), 0);
    return { assets: rows, totalDailyIncome };
  }

  /** 获取雇佣列表 */
  getEmployments(gameId: string) {
    this.requireGame(gameId);
    const rows = this.db.getEmployments(gameId);
    const totalDailySalary = rows.reduce((s, r) => s + (r.is_active ? r.salary : 0), 0);
    return { employments: rows, totalDailySalary };
  }

  /** 雇佣角色 */
  employCharacter(gameId: string, characterId: string, role: string, salary: number) {
    const world = this.requireGame(gameId);
    const char = world.characters.find(c => c.id === characterId);
    if (!char) throw new NotFoundException('角色不存在');
    this.db.saveEmployment(gameId, { employeeId: characterId, employeeName: char.name, employerId: 'player', role, salary, hiredRound: world.round, loyalty: 60, isActive: true });
    this.db.addPartyMember(gameId, characterId, char.name, role, world.round);
    char.partyRole = 'member';
    this.db.saveGame(gameId, world, '', world.difficulty, world.populationScale);
    return { success: true, employments: this.db.getEmployments(gameId), party: this.db.getPartyMembers(gameId) };
  }
  /** 获取奴隶列表 */
  getSlaves(gameId: string) {
    this.requireGame(gameId);
    return { slaves: this.db.getSlaves(gameId) };
  }

  /** 获取情报列表 */
  getIntelList(gameId: string) {
    this.requireGame(gameId);
    return { intel: this.db.getIntel(gameId, false) };
  }

  /** 获取背包 */
  getInventoryList(gameId: string) { this.requireGame(gameId); return { inventory: this.db.getInventory(gameId) }; }
  /** 获取任务 */
  getQuestList(gameId: string) { this.requireGame(gameId); return { quests: this.db.getQuests(gameId) }; }

  /** 获取关系列表 */
  getRelationshipList(gameId: string) {
    this.requireGame(gameId);
    return { relationships: this.db.getRelationships(gameId) };
  }

  /** 奴役角色 */
  enslaveCharacter(gameId: string, characterId: string, slaveType: string) {
    const world = this.requireGame(gameId);
    const char = world.characters.find(c => c.id === characterId);
    if (!char) throw new NotFoundException('角色不存在');
    const types = ['labor', 'domestic', 'sex', 'combat', 'skilled'];
    if (!types.includes(slaveType)) throw new NotFoundException('无效的奴隶类型');
    this.db.setSlave(gameId, characterId, 'player', slaveType, 30, 60, 0);
    this.db.setRelationship(gameId, 'player', characterId, -40, 0, '主仆', world.round);
    if (slaveType === 'sex') {
      this.db.saveAsset(gameId, { id: `sex_slave_${characterId}`, name: `${char.name}(性奴)`, assetType: 'contract', description: '夜间可互动恢复精神', value: 0, dailyIncome: 0, dailyUpkeep: 3, locationId: char.locationId, acquiredRound: world.round, isActive: true });
    }
    this.db.saveGame(gameId, world, '', world.difficulty, world.populationScale);
    return { success: true, slaves: this.db.getSlaves(gameId) };
  }

  /** 夜间奴隶互动：恢复精神，影响服从度和恐惧，可能有副作用 */
  slaveNightInteract(gameId: string, characterId: string) {
    const world = this.requireGame(gameId);
    const player = world.characters.find(c => c.id === world.playerId)!;
    if (world.phase !== 'night') return { success: false, error: '只能在夜晚时段进行' };
    const slave = this.db.getSlaves(gameId).find(s => s.character_id === characterId);
    if (!slave || slave.slave_type !== 'sex') return { success: false, error: '不是性奴隶' };

    const rng = createRng(world.seed + world.round);
    // 精神恢复
    const mentalRestore = 12 + Math.floor(rng() * 10);
    player.mental = Math.min(player.maxMental, player.mental + mentalRestore);

    // 服从度变化
    const obDelta = Math.floor(rng() * 6) - 1; // -1~+5
    const fearDelta = Math.floor(rng() * 4) - 1;
    const breakDelta = Math.floor(rng() * 5);

    this.db.updateSlaveInteraction(gameId, characterId, world.round, obDelta, fearDelta, breakDelta);

    // 副作用：5%概率产生心理依赖（debuff）
    let sideEffect = '';
    if (rng() < 0.05) {
      player.statusEffects.push({ type: 'addicted_night', magnitude: 3, remainingTurns: 20 });
      sideEffect = '你感觉到一种难以名状的依赖感悄然滋生...';
    }

    // 更新关系
    this.db.setRelationship(gameId, 'player', characterId,
      -35 + Math.floor(rng() * 20), 5, '主仆', world.round);

    this.db.saveGame(gameId, world, '', world.difficulty, world.populationScale);
    return { success: true, mentalRestored: mentalRestore, obedienceDelta: obDelta, fearDelta, breakDelta, sideEffect: sideEffect || null };
  }

  // ---- 内部 ----

  private buildResponse(world: WorldState, worldReview?: WorldReviewResult | null) {
    const player = world.characters.find(c => c.id === world.playerId)!;
    const loc = world.locations.find(l => l.id === player.locationId);
    const narrative = this.db.getRecentNarrative(world.gameId);
    const nearby = world.characters.filter(c => c.alive && c.locationId === player.locationId && c.id !== player.id);
    const aliveCore = world.characters.filter(c => c.alive && c.isCore).length;
    const totalCore = world.characters.filter(c => c.isCore).length;

    return {
      gameId: world.gameId, round: world.round, day: world.day, phase: world.phase,
      difficulty: world.difficulty, populationScale: world.populationScale, redMoonCountdown: world.redMoonCountdown,
      player: {
        id: player.id, name: player.name, alive: player.alive,
        health: player.health, maxHealth: player.maxHealth, mental: player.mental, maxMental: player.maxMental,
        stamina: player.stamina, maxStamina: player.maxStamina, hunger: player.hunger,
        combat: player.combat, defense: player.defense, agility: player.agility, gold: player.gold,
        attributes: player.attributes, skills: player.skills, statusEffects: player.statusEffects,
      },
      location: loc ? { id: loc.id, name: loc.name, region: loc.region, description: loc.description, isSafe: loc.isSafe, population: loc.population, connectedLocations: loc.connectedLocations } : null,
      nearbyCharacters: nearby.slice(0, 10).map(c => ({ id: c.id, name: c.name, race: c.race, isCore: c.isCore, combat: c.combat })),
      stats: { aliveCore, totalCore, totalFactions: world.factions.length, totalLocations: world.locations.length, globalStability: world.globalStability, globalFood: world.globalFood },
      recentNarrative: narrative ? { body: narrative.body, mood: narrative.mood } : null,
      worldReview: worldReview ?? undefined,
      assets: this.db.getAssets(world.gameId),
      employments: this.db.getEmployments(world.gameId),
      party: this.db.getPartyMembers(world.gameId),
      slaves: this.db.getSlaves(world.gameId),
      intel: this.db.getIntel(world.gameId, false),
      relationships: this.db.getRelationships(world.gameId),
      rules: world.rules.filter(r => r.isActive),
      weather: world.weather,
      inventory: this.db.getInventory(world.gameId),
      quests: this.db.getQuests(world.gameId),
    };
  }

  /** 世界回顾：每5回合运行一次，分析因果链和蝴蝶效应 */
  private async runWorldReview(gameId: string, world: WorldState, playerName: string): Promise<WorldReviewResult> {
    // 获取过去5回合的事件
    const recentEvents = this.db.getRecentEvents(gameId, 80);
    const events5 = recentEvents.filter(e => e.round > world.round - 5);

    // 获取最近死亡
    const deaths = this.db.db.prepare('SELECT * FROM death_log WHERE game_id=? AND round > ? ORDER BY id DESC LIMIT 10')
      .all(gameId, world.round - 5) as unknown as Array<{ character_name: string; reason: string; round: number }>;

    // 获取玩家行动历史
    const playerActions = this.db.db.prepare(
      'SELECT intent_json, round FROM action_log WHERE game_id=? AND actor_id=? AND round > ? ORDER BY round DESC LIMIT 10'
    ).all(gameId, 'player', world.round - 5) as unknown as Array<{ intent_json: string; round: number }>;

    // 势力变化
    const factionChanges = world.factions
      .map(f => ({
        name: f.name,
        change: f.morale > 60 ? '士气高昂，积极扩张' : f.morale < 30 ? '士气低落，收缩防御' : f.food <= 0 ? '粮食告急' : '维持现状',
      }));

    const player = world.characters.find(c => c.id === world.playerId)!;
    const loc = world.locations.find(l => l.id === player.locationId);
    const popConfig = { small: '500万', medium: '1000万', large: '2000万' }[world.populationScale] ?? '未知';

    const ctx: WorldReviewContext = {
      currentRound: world.round,
      currentDay: world.day,
      difficulty: world.difficulty,
      totalPop: popConfig,
      playerName,
      playerLocation: loc?.name ?? '未知',
      aliveCore: world.characters.filter(c => c.alive && c.isCore).length,
      totalCore: world.characters.filter(c => c.isCore).length,
      redMoonCountdown: world.redMoonCountdown,
      recentEvents: events5.map(e => ({ round: e.round, type: e.event_type, desc: e.description })),
      recentDeaths: deaths.map(d => ({ name: d.character_name, reason: d.reason, round: d.round })),
      factionChanges,
      playerActions: playerActions.map(a => {
        try { const j = JSON.parse(a.intent_json); return { round: a.round, action: j.label ?? j.kind ?? '未知行动' }; }
        catch { return { round: a.round, action: '未知行动' }; }
      }),
    };

    const review = await this.ai.generateWorldReview(ctx);

    // 存储世界回顾叙事
    const reviewBody = [
      `═══ 🌐 ${review.title} ═══`,
      ``,
      `🔗 因果链：${review.causalChain}`,
      ``,
      `🦋 蝴蝶效应：${review.butterflyEffect}`,
      ``,
      `📈 世界趋势：${review.worldTrend}`,
      ``,
      `💡 ${review.playerAdvice}`,
    ].join('\n');

    this.db.saveNarrative(gameId, world.round, world.day, world.phase, reviewBody, `review_${review.mood}`,
      [review.causalChain, review.butterflyEffect, review.worldTrend], []);

    return review;
  }

  /** 每日资产收入结算 */
  /** 同步背包到DB */
  private syncInventoryToDb(gameId: string, world: WorldState) {
    for (const item of world.inventory) {
      this.db.addItem(gameId, { id: item.id, name: item.name, itemType: item.itemType, quantity: item.quantity, description: item.description, value: item.value });
    }
    world.inventory = []; // 清空内存，下次从DB加载
  }
  /** 同步任务到DB */
  private syncQuestsToDb(gameId: string, world: WorldState) {
    for (const q of world.quests) {
      this.db.addQuest(gameId, { id: q.id, name: q.name, description: q.description, category: q.category, objectives: q.objectives, rewards: q.rewards as Record<string, unknown>, giverId: (q as any).giverId, deadlineDay: (q as any).deadlineDay, acquiredRound: q.acquiredRound });
    }
    world.quests = [];
  }

  private settleDailyAssets(world: WorldState) {
    const player = world.characters.find(c => c.id === world.playerId)!;
    const assets = this.db.getAssets(world.gameId);
    let totalIncome = 0, totalUpkeep = 0;
    for (const a of assets) { if (a.is_active) { totalIncome += a.daily_income; totalUpkeep += a.daily_upkeep; } }
    const net = totalIncome - totalUpkeep;
    player.gold += net;
    if (net !== 0) this.db.setFlag(world.gameId, `daily_settle_${world.day}`, `净收入${net > 0 ? '+' : ''}${net}金币`);
  }

  /** 每日雇佣工资结算 */
  private settleDailyEmployments(world: WorldState) {
    const player = world.characters.find(c => c.id === world.playerId)!;
    const emps = this.db.getEmployments(world.gameId);
    let totalSalary = 0;
    for (const e of emps) {
      if (!e.is_active) continue;
      totalSalary += e.salary;
      const newLoyalty = Math.max(0, Math.min(100, e.loyalty + Math.floor(Math.random() * 7) - 3));
      this.db.saveEmployment(world.gameId, { employeeId: e.employee_id, employeeName: e.employee_name, employerId: e.employer_id, role: e.role, salary: e.salary, hiredRound: e.hired_round, loyalty: newLoyalty, isActive: newLoyalty >= 10 });
      if (newLoyalty < 15) { this.db.removeEmployment(world.gameId, e.employee_id); this.db.removePartyMember(world.gameId, e.employee_id); }
    }
    player.gold -= totalSalary;
  }

  /** 奴隶每日处理：服从度自然变化，低服从可能逃跑 */
  private processSlaveDaily(world: WorldState) {
    const slaves = this.db.getSlaves(world.gameId);
    for (const s of slaves) {
      const obDelta = Math.floor(Math.random() * 5) - 2; // -2~+2
      const fearDelta = Math.floor(Math.random() * 3) - 3; // 恐惧自然衰减 -3~0
      this.db.updateSlaveInteraction(world.gameId, s.character_id, world.round, obDelta, fearDelta, 0);

      // 服从度极低 → 逃跑尝试
      const newOb = s.obedience + obDelta;
      if (newOb < 10 && Math.random() < 0.15) {
        this.db.db.prepare('UPDATE slaves SET escape_attempts=escape_attempts+1, obedience=0 WHERE game_id=? AND character_id=?').run(world.gameId, s.character_id);
        // 逃亡事件
        const char = world.characters.find(c => c.id === s.character_id);
        if (char) {
          this.db.saveNarrative(world.gameId, world.round, world.day, world.phase,
            `⚡ ${char.name}试图逃跑！`, 'tense',
            [`奴隶${char.name}因服从度过低试图逃跑`], [s.character_id]);
        }
      }
    }
  }

  /** 关系自然衰减：长时间不互动的关系会逐渐冷却 */
  private decayRelationships(world: WorldState) {
    const rels = this.db.getRelationships(world.gameId) as unknown as Array<{ char_a: string; char_b: string; affection: number; trust: number; status: string; last_interaction_round: number }>;
    for (const r of rels) {
      const daysSince = Math.floor((world.round - r.last_interaction_round) / 6); // 6回合≈1天
      if (daysSince > 7 && Math.abs(r.affection) < 50) {
        // 超过7天没互动，轻度感情衰减
        const decay = Math.sign(r.affection) * -1 * Math.min(3, daysSince - 7);
        this.db.setRelationship(world.gameId, r.char_a, r.char_b, r.affection + decay, r.trust - 1, r.status, world.round);
      }
    }
  }

  /** 动态生成行动：从DB模板 + 位置 + 时间 + 资产 + 队伍 + 紧急状态 */
  private generateDynamicActions(world: WorldState, player: WorldState['characters'][0], loc: WorldState['locations'][0] | undefined) {
    const templates = this.db.getAllActionTemplates();
    const actions: Array<{
      kind: string; targetId?: string; label: string; detail?: string;
      cost: { phases: number; stamina: number; hunger: number };
      category: string; isEmergency?: boolean;
    }> = [];

    // 移动——始终可用
    if (loc) for (const connId of loc.connectedLocations) {
      const conn = world.locations.find(l => l.id === connId);
      if (conn) actions.push({
        kind: 'move', targetId: conn.id, label: `前往${conn.name}`,
        cost: { phases: conn.travelCost, stamina: 8, hunger: 3 },
        category: '移动',
      });
    }

    // 从模板匹配
    const locationHas = this.inferLocationFeatures(loc);
    const locationType = this.inferLocationType(loc);
    const hasFood = world.globalFood > 0;
    const hasMedicine = false; // TODO: check inventory
    const hasSexSlave = this.db.getSlaves(world.gameId).some(s => s.slave_type === 'sex' && s.owner_id === 'player');

    for (const t of templates) {
      try {
        const cond = JSON.parse(t.conditions_json) as Record<string, unknown>;
        // 检查地点类型
        if (cond['locationType'] && Array.isArray(cond['locationType']) && !(cond['locationType'] as string[]).includes('any') && !(cond['locationType'] as string[]).includes(locationType)) continue;
        // 检查地点特征
        if (cond['locationHas'] && Array.isArray(cond['locationHas'])) {
          if (!(cond['locationHas'] as string[]).some(f => locationHas.includes(f))) continue;
        }
        // 检查时段
        if (cond['phase'] && Array.isArray(cond['phase']) && !(cond['phase'] as string[]).includes(world.phase)) continue;
        // 检查需要资产（如sex_slave）
        if (cond['requiresAsset'] && Array.isArray(cond['requiresAsset'])) {
          if ((cond['requiresAsset'] as string[]).includes('sex_slave') && !hasSexSlave) continue;
        }
        // 检查物品
        if (cond['requiresItem'] === 'food' && !hasFood) continue;
        if (cond['requiresItem'] === 'medicine' && !hasMedicine) continue;
        // 检查玩家专属
        if (cond['playerOnly'] && player.id !== 'player') continue;
        // 检查紧急行动
        const isEmergency = cond['emergencyAction'] === true;
        if (isEmergency && player.hunger < 70 && player.health > 30) continue; // 非紧急不显示

        actions.push({
          kind: t.kind as ActionKind,
          label: t.label,
          detail: t.detail ?? undefined,
          cost: { phases: t.cost_phases, stamina: t.cost_stamina, hunger: t.cost_hunger },
          category: t.category,
          isEmergency,
        });
      } catch { /* skip malformed conditions */ }
    }

    return actions;
  }

  private inferLocationType(loc: WorldState['locations'][0] | undefined): string {
    if (!loc) return 'any';
    const id = loc.id;
    if (id.includes('market') || id.includes('inn') || id.includes('gate') || id.includes('square') || id.includes('temple')) return 'town';
    if (id.includes('marsh') || id.includes('deep') || id.includes('road') || id.includes('wall')) return 'wild';
    if (id.includes('village') || id.includes('reed') || id.includes('hill')) return 'village';
    if (id.includes('city') || id.includes('capital')) return 'city';
    return 'any';
  }

  private inferLocationFeatures(loc: WorldState['locations'][0] | undefined): string[] {
    if (!loc) return [];
    const f: string[] = [];
    if (loc.isSafe) f.push('shelter');
    if (loc.id.includes('inn') || loc.id.includes('hotel')) { f.push('bed'); f.push('tavern'); }
    if (loc.id.includes('temple') || loc.id.includes('cathedral')) f.push('temple');
    if (loc.id.includes('market')) f.push('market');
    if (loc.id.includes('marsh') || loc.id.includes('river')) f.push('water');
    if (loc.name.includes('旅馆') || loc.name.includes('客栈')) { f.push('bed'); f.push('tavern'); }
    if (loc.name.includes('神殿') || loc.name.includes('圣殿') || loc.name.includes('修道院')) f.push('temple');
    if (loc.name.includes('集市') || loc.name.includes('市场')) f.push('market');
    return f;
  }

  /** 情报自动收集：探索/侦察/社交时概率获得情报 */
  private collectIntelOnAction(world: WorldState, intent: Intent) {
    const rng = createRng(world.seed + world.round * 13 + intent.actorId.length);
    const kinds = ['explore', 'scout', 'socialize', 'hunt', 'trade'];
    if (!kinds.includes(intent.kind)) return;

    const chanceByKind: Record<string, number> = { explore: 0.35, scout: 0.5, socialize: 0.3, hunt: 0.15, trade: 0.25 };
    if (rng() > (chanceByKind[intent.kind] ?? 0.2)) return;

    const actor = world.characters.find(c => c.id === intent.actorId);
    const loc = world.locations.find(l => l.id === actor?.locationId);

    const rumorPool = [
      { c: '神殿最近在王都周边增加了巡逻', cat: 'military', truth: 70 },
      { c: `${loc?.name ?? '某地'}附近有魔物出没的痕迹`, cat: 'threat', truth: 55 },
      { c: '北门集市粮价三天内涨了两成', cat: 'economic', truth: 60 },
      { c: `有人在${loc?.name ?? '附近'}看到了亚人商队的踪迹`, cat: 'rumor', truth: 40 },
      { c: '灰袍守卫最近在搜查逃奴', cat: 'political', truth: 75 },
      { c: '暮河镇的药材商在囤货', cat: 'economic', truth: 65 },
    ];
    const rumor = rumorPool[Math.floor(rng() * rumorPool.length)];

    this.db.addIntel(world.gameId, {
      id: `intel_${world.round}_${Math.floor(rng() * 10000)}`,
      content: rumor.c,
      category: rumor.cat,
      source: intent.kind,
      truthProbability: rumor.truth,
      acquiredRound: world.round,
      expiryDay: world.day + Math.floor(rng() * 15) + 3,
      relatedLocationId: loc?.id,
    });
  }

  private async generateNpcDecisionsAsync(world: WorldState): Promise<NpcDecision[]> {
    const rng = createRng(world.seed + world.round * 997);
    const coreNpcs = world.characters.filter(c => c.alive && !c.isPlayer && c.isCore);
    const decisions: NpcDecision[] = [];

    for (const npc of coreNpcs.slice(0, 20)) {
      if (npc.stamina < 20) {
        decisions.push({ characterId: npc.id, intent: { actorId: npc.id, kind: 'rest', label: '体力不足，休整' }, reasoning: '体力过低', aiGuided: true });
        continue;
      }
      if (npc.hunger > 70) {
        decisions.push({ characterId: npc.id, intent: { actorId: npc.id, kind: pick(['hunt', 'gather'] as const, rng), label: '外出觅食' }, reasoning: '饥饿', aiGuided: true });
        continue;
      }
      try {
        const loc = world.locations.find(l => l.id === npc.locationId);
        const ctx: NpcDecisionContext = {
          npcName: npc.name, npcRace: npc.race, npcRole: '',
          npcStats: { health: npc.health, stamina: npc.stamina, hunger: npc.hunger },
          npcFaction: world.factions.find(f => f.id === npc.factionId)?.name ?? '未知',
          npcLocation: loc?.name ?? '未知', npcDesc: npc.race,
        };
        const aiDecision = await this.ai.generateNpcDecisions(ctx);
        const kinds = ['work', 'explore', 'socialize', 'rest', 'scout', 'trade', 'wait'] as const;
        decisions.push({ characterId: npc.id, intent: { actorId: npc.id, kind: pick(kinds, rng), label: aiDecision }, reasoning: aiDecision, aiGuided: true });
      } catch {
        const kinds = ['work', 'explore', 'socialize', 'rest', 'wait'] as const;
        decisions.push({ characterId: npc.id, intent: { actorId: npc.id, kind: pick(kinds, rng), label: '自主行动' }, reasoning: '随机', aiGuided: false });
      }
    }
    return decisions;
  }
}
