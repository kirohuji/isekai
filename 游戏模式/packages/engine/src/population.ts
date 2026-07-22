import type { CharacterState, FactionGroup, Location, WorldState, PopulationScale, FactionAction } from './types.js';
import { RACES, OCCUPATIONS, POPULATION_SCALES } from './types.js';
import { createRng, pick, gaussianRandom, clamp, uid, weightedPick } from './config.js';

// ============================================================
// 人口系统：大规模统计 + 核心角色个体追踪
// ============================================================

/** 生成世界初始人口 */
export function generatePopulation(
  scale: PopulationScale,
  seed: number,
  locations: Location[],
): { characters: CharacterState[]; factions: FactionGroup[] } {
  const rng = createRng(seed);
  const config = POPULATION_SCALES[scale];
  const characters: CharacterState[] = [];
  const factions: FactionGroup[] = [];

  // 生成势力
  const factionDefs = generateFactionDefs(config.factionCount, seed, locations);
  for (const def of factionDefs) {
    const factionSeed = seed + def.name.length * 100;
    const factionRng = createRng(factionSeed);
    
    const factionPop = Math.floor(config.total * def.popShare);
    const faction: FactionGroup = {
      id: def.id,
      name: def.name,
      type: def.type,
      regionId: def.homeLocationId,
      totalPopulation: factionPop,
      activePopulation: factionPop,
      avgHealth: 70 + factionRng() * 25,
      avgMental: 65 + factionRng() * 30,
      avgCombat: def.militaristic ? 4 + factionRng() * 8 : 1 + factionRng() * 4,
      food: Math.floor(factionPop * (0.5 + factionRng() * 2)),
      gold: Math.floor(factionPop * (0.2 + factionRng() * 1.5)),
      morale: 50 + factionRng() * 30,
      attitudes: {},
      currentFocus: 'defending',
    };
    factions.push(faction);
  }

  // 初始化势力间态度
  for (const f1 of factions) {
    for (const f2 of factions) {
      if (f1.id === f2.id) continue;
      f1.attitudes[f2.id] = Math.floor((rng() - 0.5) * 60);
    }
  }

  // 生成核心角色
  for (let i = 0; i < config.coreCount; i++) {
    const charRng = createRng(seed + i * 777 + 333);
    const faction = pick(factions, charRng);
    const location = pick(locations, charRng);
    characters.push(generateCharacter(i, faction, location, charRng));
  }

  return { characters, factions };
}

/** 生成一个随机角色 */
export function generateCharacter(
  index: number,
  faction: FactionGroup,
  location: Location,
  rng: () => number,
): CharacterState {
  const race = pick(RACES, rng);
  const gender = rng() > 0.48 ? 'male' : 'female';
  
  const baseHealth = 60 + rng() * 40;
  const baseMental = 50 + rng() * 50;
  const baseStamina = 50 + rng() * 50;
  
  const militaristic = faction.type === 'bandit' || faction.type === 'kingdom';
  const combatBase = militaristic ? 3 + rng() * 8 : rng() * 4;
  
  return {
    id: `npc_${index}`,
    name: generateName(race, gender as 'male' | 'female', rng),
    race,
    gender: gender as 'male' | 'female',
    isPlayer: false,
    isCore: index < 40, // 前40个核心角色被AI重点追踪
    alive: true,
    locationId: location.id,
    health: Math.round(baseHealth),
    maxHealth: 100,
    mental: Math.round(baseMental),
    maxMental: 100,
    stamina: Math.round(baseStamina),
    maxStamina: 100,
    hunger: Math.round(rng() * 30),
    combat: Math.round(combatBase),
    defense: Math.round(rng() * 5),
    agility: Math.round(3 + rng() * 7),
    attributes: {
      insight: Math.round(rng() * 5),
      composure: Math.round(rng() * 5),
      tenacity: Math.round(rng() * 5),
      charisma: Math.round(rng() * 5),
      cunning: Math.round(rng() * 5),
    },
    skills: generateRandomSkills(rng),
    statusEffects: [],
    factionId: faction.id,
    gold: Math.round(rng() * 50),
  };
}

/** 生成主角 */
export function generatePlayer(
  name: string,
  location: Location,
  difficulty: string,
): CharacterState {
  const bonus = difficulty === 'story' ? 2 : difficulty === 'survival' ? 0 : -1;
  return {
    id: 'player',
    name,
    race: '人类',
    gender: 'male',
    isPlayer: true,
    isCore: true,
    alive: true,
    locationId: location.id,
    health: 100,
    maxHealth: 100,
    mental: 90 + bonus * 5,
    maxMental: 100,
    stamina: 100,
    maxStamina: 100,
    hunger: 0,
    combat: 2 + bonus,
    defense: 2 + bonus,
    agility: 5 + bonus,
    attributes: {
      insight: 2 + Math.max(0, bonus),
      composure: 2 + Math.max(0, bonus),
      tenacity: 1 + Math.max(0, bonus),
      charisma: 0 + Math.max(0, bonus),
      cunning: 1 + Math.max(0, bonus),
    },
    skills: [
      { name: '经商·账目计算', level: 2, experience: 0 },
      { name: '策略·危机判断', level: 2, experience: 0 },
      { name: '社交·谈判', level: 1, experience: 0 },
      { name: '知识·现代医学基础', level: 2, experience: 0 },
    ],
    statusEffects: [],
    factionId: 'player_party',
    gold: 0,
  };
}

/** 为NPC随机分配行动意图 */
export function generateNpcIntents(
  characters: CharacterState[],
  rng: () => number,
): Array<{ characterId: string; kind: string; targetId?: string; label?: string; aiGuided: boolean; reasoning?: string }> {
  const actionKinds = ['rest', 'work', 'explore', 'socialize', 'trade', 'hunt', 'gather', 'scout', 'wait'] as const;
  
  return characters
    .filter(c => c.alive && !c.isPlayer)
    .map(c => {
      // 体力低的优先休息
      if (c.stamina < 20) {
        return { characterId: c.id, kind: 'rest', label: '体力不足，原地休整', aiGuided: false };
      }
      // 饥饿高的优先寻找食物
      if (c.hunger > 70 && c.isCore) {
        return { characterId: c.id, kind: 'hunt', label: '饥饿难耐，外出狩猎', aiGuided: false };
      }
      // 随机行动
      const kind = pick(actionKinds, rng);
      return {
        characterId: c.id,
        kind,
        label: `进行${kind}活动`,
        aiGuided: false,
      };
    });
}

/** 势力群体的回合级行动（统计层面） */
export function resolveFactionActions(
  factions: FactionGroup[],
  rng: () => number,
): FactionAction[] {
  const actions: FactionAction[] = [];
  
  for (const faction of factions) {
    // 根据势力类型和状态决定行动倾向
    const willRaid = faction.type === 'bandit' && faction.morale > 40 && rng() < 0.3;
    const willTrade = faction.type === 'merchant' && rng() < 0.5;
    const willExpand = faction.type === 'kingdom' && faction.morale > 60 && rng() < 0.2;
    
    if (willRaid) {
      const targets = factions.filter(f => f.id !== faction.id && f.type !== 'monster');
      if (targets.length > 0) {
        const target = pick(targets, rng);
        const damage = Math.floor(faction.avgCombat * faction.activePopulation * 0.00001 * (0.5 + rng()));
        target.activePopulation = Math.max(0, target.activePopulation - damage);
        target.food = Math.max(0, target.food - Math.floor(damage * 2));
        target.morale = clamp(target.morale - Math.floor(rng() * 15), 0, 100);
        faction.gold += Math.floor(damage * 3);
        faction.attitudes[target.id] = clamp((faction.attitudes[target.id] ?? 0) - 20, -100, 100);
        actions.push({
          factionId: faction.id,
          actionType: 'raid',
          targetFactionId: target.id,
          result: { damage, foodLost: Math.floor(damage * 2), moraleChange: -Math.floor(rng() * 15) },
        });
      }
    } else if (willTrade) {
      const partner = pick(factions.filter(f => f.id !== faction.id), rng);
      const tradeAmount = Math.floor(faction.gold * 0.05);
      faction.gold += tradeAmount;
      faction.attitudes[partner.id] = clamp((faction.attitudes[partner.id] ?? 0) + 10, -100, 100);
      actions.push({
        factionId: faction.id,
        actionType: 'trade',
        targetFactionId: partner.id,
        result: { goldEarned: tradeAmount },
      });
    }
    
    // 自然消耗
    const foodConsumption = Math.floor(faction.activePopulation * 0.001);
    faction.food = Math.max(0, faction.food - foodConsumption);
    
    // 食物不足降士气
    if (faction.food < faction.activePopulation * 0.0005) {
      faction.morale = clamp(faction.morale - 3, 0, 100);
    }
    
    // 人口自然变化
    if (faction.food > 0 && faction.morale > 30) {
      faction.activePopulation = Math.floor(faction.activePopulation * (1 + (rng() - 0.5) * 0.001));
    } else if (faction.food <= 0) {
      faction.activePopulation = Math.floor(faction.activePopulation * 0.998);
    }
  }
  
  return actions;
}

// ============================================================
// 内部辅助
// ============================================================

interface FactionDef {
  id: string;
  name: string;
  type: FactionGroup['type'];
  homeLocationId: string;
  popShare: number;
  militaristic: boolean;
}

function generateFactionDefs(count: number, seed: number, locations: Location[]): FactionDef[] {
  const rng = createRng(seed);
  const defs: FactionDef[] = [
    { id: 'royal_court', name: '王室', type: 'kingdom', homeLocationId: locations[0]?.id ?? 'capital', popShare: 0.03, militaristic: true },
    { id: 'church', name: '神殿', type: 'church', homeLocationId: locations[1]?.id ?? 'temple', popShare: 0.05, militaristic: false },
    { id: 'merchant_guild', name: '商会联盟', type: 'merchant', homeLocationId: locations[2]?.id ?? 'market', popShare: 0.02, militaristic: false },
    { id: 'gray_hill_settlers', name: '灰丘拓荒者', type: 'village', homeLocationId: locations[3]?.id ?? 'gray_hill', popShare: 0.002, militaristic: false },
    { id: 'bandit_confederation', name: '盗贼同盟', type: 'bandit', homeLocationId: locations[4]?.id ?? 'marsh', popShare: 0.01, militaristic: true },
  ];
  
  // 补充随机势力
  for (let i = defs.length; i < count; i++) {
    const types: FactionGroup['type'][] = ['village', 'tribe', 'merchant', 'bandit'];
    defs.push({
      id: `faction_${i}`,
      name: `${pick(['北', '南', '东', '西', '铁', '银', '灰', '赤', '碧', '苍'], rng)}${pick(['风', '狼', '鹰', '熊', '蛇', '鹿', '鸦', '狐', '狮', '龙'], rng)}${pick(['领', '会', '盟', '部', '族', '帮', '团'], rng)}`,
      type: pick(types, rng),
      homeLocationId: pick(locations, rng).id,
      popShare: 0.005 + rng() * 0.03,
      militaristic: rng() > 0.6,
    });
  }
  
  // 归一化人口份额
  const totalShare = defs.reduce((s, d) => s + d.popShare, 0);
  defs.forEach(d => d.popShare /= totalShare);
  
  return defs;
}

function generateName(race: string, gender: 'male' | 'female', rng: () => number): string {
  const maleNames = ['阿兰', '卡斯', '雷恩', '诺德', '盖尔', '维克', '奥森', '凯尔', '鲁斯', '艾德', '芬恩', '达里'];
  const femaleNames = ['艾琳', '莉亚', '娜塔', '莎拉', '米拉', '艾莎', '芙蕾', '温蒂', '索菲', '卡莲', '玛雅', '伊芙'];
  const surnames = ['铁锤', '风行者', '石盾', '银手', '黑木', '火炉', '白鹿', '灰狼', '铜叶', '霜月'];
  
  const given = gender === 'male' ? pick(maleNames, rng) : pick(femaleNames, rng);
  const surname = rng() > 0.4 ? '·' + pick(surnames, rng) : '';
  return given + surname;
}

function generateRandomSkills(rng: () => number): { name: string; level: number; experience: number }[] {
  const skillPool = ['战斗·基础', '狩猎·追踪', '采集·识别', '经商·计算', '社交·话术', '策略·计划', '生存·耐饿', '工艺·制作'];
  const count = Math.floor(rng() * 3) + 1;
  const skills: { name: string; level: number; experience: number }[] = [];
  for (let i = 0; i < count; i++) {
    skills.push({
      name: pick(skillPool, rng),
      level: Math.floor(rng() * 4) + 1,
      experience: Math.floor(rng() * 50),
    });
  }
  return skills;
}
