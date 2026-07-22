import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 30000 });

export interface GameResponse {
  gameId: string; round: number; day: number; phase: string;
  difficulty: string; populationScale: string; redMoonCountdown: number;
  player: {
    id: string; name: string; alive: boolean;
    health: number; maxHealth: number; mental: number; maxMental: number;
    stamina: number; maxStamina: number; hunger: number;
    combat: number; defense: number; agility: number; gold: number;
    attributes: Record<string, number>;
    skills: Array<{ name: string; level: number; experience: number }>;
    statusEffects: Array<{ type: string; magnitude: number; remainingTurns: number }>;
  };
  location: {
    id: string; name: string; region: string; description: string;
    isSafe: boolean; population: number; connectedLocations: string[];
  } | null;
  nearbyCharacters: Array<{ id: string; name: string; race: string; isCore: boolean; combat: number }>;
  stats: { aliveCore: number; totalCore: number; totalFactions: number; totalLocations: number; globalStability: number; globalFood: number };
  recentNarrative: { body: string; mood: string } | null;
  worldSeed?: { rumors: string[]; specialPlaces: Array<{ name: string; desc: string }>; seasonWeather: string };
  occupation?: { id: string; name: string; desc: string };
  worldReview?: { title: string; causalChain: string; butterflyEffect: string; worldTrend: string; playerAdvice: string; mood: string } | null;
  assets?: Array<{ asset_id: string; name: string; asset_type: string; description: string; value: number; daily_income: number; daily_upkeep: number; location_id: string; acquired_round: number; is_active: number }>;
  employments?: Array<{ employee_id: string; employee_name: string; employer_id: string; role: string; salary: number; hired_round: number; loyalty: number; is_active: number }>;
  party?: Array<{ character_id: string; character_name: string; role: string; joined_round: number }>;
  rules?: Array<{ id: string; name: string; description: string; category: string; duration: number; source: string; isActive: boolean }>;
  weather?: { type: string; intensity: number; description: string; remainingRounds: number };
}

export interface CharacterDetail {
  id: string; name: string; race: string; gender: string;
  isPlayer: boolean; isCore: boolean; alive: boolean;
  stats: { health: number; maxHealth: number; mental: number; maxMental: number; stamina: number; maxStamina: number; hunger: number };
  combat: { combat: number; defense: number; agility: number };
  attributes: Record<string, number>;
  skills: Array<{ name: string; level: number; experience: number }>;
  statusEffects: Array<{ type: string; magnitude: number; remainingTurns: number }>;
  gold: number;
  location: { id: string; name: string; region: string } | null;
  faction: { id: string; name: string } | null;
  party: { role: string; joinedRound: number } | null;
  employment: { role: string; salary: number; loyalty: number } | null;
}

export interface RegularAction {
  kind: string; targetId?: string; label: string;
  cost: { phases: number; stamina: number; hunger: number };
  costLabel: string; category: string;
}
export interface DynamicAction { kind: string; label: string; detail: string; targetId?: string; isAi: boolean; }

export const api = {
  createGame: (data: { name: string; difficulty: string; populationScale: string; occupation?: string; seed?: string }) =>
    http.post<GameResponse>('/game', data).then(r => r.data),

  getGame: (id: string) =>
    http.get<GameResponse>(`/game/${id}`).then(r => r.data),

  getActions: (id: string) =>
    http.get<{ regularActions: RegularAction[]; dynamicActions: DynamicAction[]; round: number; playerDead: boolean }>(`/game/${id}/actions`).then(r => r.data),

  act: (id: string, action: { kind: string; targetId?: string; detail?: string; label?: string }) =>
    http.post<GameResponse>(`/game/${id}/act`, action).then(r => r.data),

  getLog: (id: string) =>
    http.get(`/game/${id}/log`).then(r => r.data),

  // 角色详情
  getCharacter: (gameId: string, charId: string) =>
    http.get<CharacterDetail>(`/game/${gameId}/character/${charId}`).then(r => r.data),

  // 队伍
  partyJoin: (gameId: string, characterId: string, role?: string) =>
    http.post(`/game/${gameId}/party/join`, { characterId, role }).then(r => r.data),

  partyLeave: (gameId: string, characterId: string) =>
    http.post(`/game/${gameId}/party/leave`, { characterId }).then(r => r.data),

  // 资产
  getAssets: (gameId: string) =>
    http.get(`/game/${gameId}/assets`).then(r => r.data),

  getEmployments: (gameId: string) =>
    http.get(`/game/${gameId}/employments`).then(r => r.data),

  employ: (gameId: string, characterId: string, role: string, salary: number) =>
    http.post(`/game/${gameId}/employ`, { characterId, role, salary }).then(r => r.data),
};
