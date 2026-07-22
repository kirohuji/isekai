import type { WorldState, Location } from './types.js';
import { generatePopulation, generatePlayer } from './population.js';
import { POPULATION_SCALES, DIFFICULTY_CONFIG } from './types.js';
import type { Difficulty, PopulationScale } from './types.js';
import { createRng, uid } from './config.js';

/**
 * 世界初始化器
 * 创建全新的世界状态
 */
export interface NewGameInput {
  playerName: string;
  difficulty: Difficulty;
  populationScale: PopulationScale;
  seed?: number;
}

export function createWorld(input: NewGameInput): WorldState {
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);
  const popConfig = POPULATION_SCALES[input.populationScale];
  const diffConfig = DIFFICULTY_CONFIG[input.difficulty];

  // 生成地点
  const locations = generateLocations(popConfig.locationCount, seed, rng);

  // 生成人口
  const { characters, factions } = generatePopulation(input.populationScale, seed + 1, locations);

  // 生成主角
  const player = generatePlayer(input.playerName, locations[0], input.difficulty);

  // 添加主角到角色列表
  characters.unshift(player);

  // 为主角创建势力
  factions.unshift({
    id: 'player_party',
    name: `${input.playerName}的队伍`,
    type: 'village',
    regionId: locations[0].id,
    totalPopulation: 1,
    activePopulation: 1,
    avgHealth: 100,
    avgMental: 90,
    avgCombat: 2,
    food: diffConfig.startingFood * 100,
    gold: diffConfig.startingGold * 100,
    morale: 70,
    attitudes: {},
    currentFocus: 'defending',
  });

  // 初始化势力间态度
  for (const faction of factions) {
    for (const other of factions) {
      if (faction.id === other.id) continue;
      if (!(other.id in faction.attitudes)) {
        faction.attitudes[other.id] = Math.floor((rng() - 0.5) * 40);
      }
    }
  }

  const world: WorldState = {
    gameId: uid('game', rng),
    round: 0,
    day: 1,
    phase: 'morning',
    difficulty: input.difficulty,
    populationScale: input.populationScale,
    seed,
    year: 847,
    month: 3,
    redMoonCountdown: 700,
    playerId: 'player',
    characters,
    factions,
    locations,
    globalFood: diffConfig.startingFood * 100,
    globalStability: input.difficulty === 'doom' ? 30 : input.difficulty === 'survival' ? 50 : 70,
  };

  return world;
}

/**
 * 生成地点列表
 */
function generateLocations(count: number, seed: number, rng: () => number): Location[] {
  // 核心地点（必须存在）
  const coreLocations: Location[] = [
    {
      id: 'summon_square', name: '召唤广场', region: '王都',
      description: '圆形大厅外的广场，异世界召唤仪式的落点。石板地面上刻着褪色的符文。',
      isSafe: true, travelCost: 0, connectedLocations: ['north_market', 'old_inn', 'temple_district'],
      population: 5000, factionControl: 'royal_court',
    },
    {
      id: 'north_market', name: '北门集市', region: '王都',
      description: '粮食、旧衣物、药草的交易场所。人多眼杂，谣言和情报在这里交换。',
      isSafe: true, travelCost: 1, connectedLocations: ['summon_square', 'gray_rope_market', 'city_gate'],
      population: 8000, factionControl: 'merchant_guild',
    },
    {
      id: 'old_inn', name: '旧鹿角旅馆', region: '王都平民区',
      description: '六间客房的小旅馆，前门对着一条半死不活的巷子。玛莎的炖菜味道不错。',
      isSafe: true, travelCost: 1, connectedLocations: ['summon_square', 'sewer_entrance'],
      population: 30, factionControl: 'gray_hill_settlers',
    },
    {
      id: 'temple_district', name: '神殿区', region: '王都',
      description: '灰袍守卫每隔三个路口设一个检查岗。空气中弥漫着焚香和恐惧。',
      isSafe: false, travelCost: 1, connectedLocations: ['summon_square', 'city_gate'],
      population: 3000, factionControl: 'church',
    },
    {
      id: 'gray_rope_market', name: '灰绳市场', region: '王都城外',
      description: '合法与非法奴隶交易中心。栅栏后面是笼子。亚人的哭声从早到晚。',
      isSafe: false, travelCost: 2, connectedLocations: ['north_market', 'sewer_entrance', 'marsh_edge'],
      population: 2000, factionControl: 'bandit_confederation',
    },
    {
      id: 'sewer_entrance', name: '排水道入口', region: '王都地下',
      description: '连接旅馆地窖和城外的地下通道。黑暗、潮湿、部分坍塌。逃亡者的密道。',
      isSafe: false, travelCost: 1, connectedLocations: ['old_inn', 'marsh_edge', 'gray_rope_market'],
      population: 100, factionControl: 'gray_hill_settlers',
    },
    {
      id: 'city_gate', name: '王都城门', region: '王都',
      description: '巨大的铁箍木门。守卫检查每一个出城的人——主要是查奴隶。',
      isSafe: true, travelCost: 1, connectedLocations: ['north_market', 'temple_district', 'road_south'],
      population: 500, factionControl: 'royal_court',
    },
    {
      id: 'road_south', name: '南方大道', region: '王都外围',
      description: '连接王都与东南边境的主路。路边有废弃的哨站和商队营地。',
      isSafe: false, travelCost: 2, connectedLocations: ['city_gate', 'marsh_edge', 'twilight_town'],
      population: 1000, factionControl: 'royal_court',
    },
    {
      id: 'marsh_edge', name: '东南沼泽·边缘', region: '东南边境',
      description: '王都外的危险缓冲区。腐齿鼠、沼鳄、拾荒者出没。亚人聚落的入口隐藏其中。',
      isSafe: false, travelCost: 2, connectedLocations: ['sewer_entrance', 'road_south', 'twilight_town', 'gray_rope_market'],
      population: 300, factionControl: 'none',
    },
    {
      id: 'twilight_town', name: '暮河镇', region: '东南边境',
      description: '边境小镇。药草、木材、渡船。权力网络腐败，周启明在此有眼线。',
      isSafe: true, travelCost: 3, connectedLocations: ['road_south', 'marsh_edge', 'reed_village', 'monastery_outer'],
      population: 3000, factionControl: 'merchant_guild',
    },
    {
      id: 'reed_village', name: '苇水村', region: '东南边境',
      description: '人类与亚人共存的小村庄。村长奥森。洪水后粮食仅余十余天。',
      isSafe: true, travelCost: 1, connectedLocations: ['twilight_town', 'gray_hill'],
      population: 500, factionControl: 'gray_hill_settlers',
    },
    {
      id: 'monastery_outer', name: '暮河镇外围修道院', region: '东南边境',
      description: '许安然的避难所。周边可能有周启明的人监视。',
      isSafe: true, travelCost: 1, connectedLocations: ['twilight_town'],
      population: 50, factionControl: 'church',
    },
    {
      id: 'gray_hill', name: '灰丘', region: '东南边境',
      description: '苇水村南侧约两里的废弃高地。石基木屋+坍塌储藏坑。你的新据点。',
      isSafe: true, travelCost: 0, connectedLocations: ['reed_village', 'marsh_edge'],
      population: 5, factionControl: 'gray_hill_settlers',
    },
    {
      id: 'deep_marsh', name: '东南沼泽·深处', region: '东南边境',
      description: '魔化生物更多。亚人聚落隐藏在深处。很少有人活着回来。',
      isSafe: false, travelCost: 3, connectedLocations: ['marsh_edge'],
      population: 100, factionControl: 'none',
    },
  ];

  // 补充随机地点
  const regionNames = ['北部平原', '西部矿区', '东部森林', '南部沿海', '中部丘陵', '边境地带'];
  const placeTypes = ['村庄', '小镇', '哨站', '矿场', '伐木场', '渔村', '要塞', '废墟', '洞穴', '圣所'];
  
  for (let i = coreLocations.length; i < count; i++) {
    const region = regionNames[Math.floor(rng() * regionNames.length)];
    const type = placeTypes[Math.floor(rng() * placeTypes.length)];
    coreLocations.push({
      id: `loc_${i}`,
      name: `${region}${type}`,
      region,
      description: `一个位于${region}的${type}。`,
      isSafe: rng() > 0.4,
      travelCost: Math.floor(rng() * 4) + 1,
      connectedLocations: [],
      population: Math.floor(rng() * 5000) + 100,
      factionControl: 'none',
    });
  }

  // 建立随机连接
  for (let i = 0; i < coreLocations.length; i++) {
    for (let j = i + 1; j < coreLocations.length; j++) {
      if (rng() < 0.15 && !coreLocations[i].connectedLocations.includes(coreLocations[j].id)) {
        coreLocations[i].connectedLocations.push(coreLocations[j].id);
        coreLocations[j].connectedLocations.push(coreLocations[i].id);
      }
    }
  }

  return coreLocations;
}
