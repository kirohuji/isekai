const BASE = '/api';

export interface GameResponse {
  gameId: string;
  round: number;
  day: number;
  phase: string;
  difficulty: string;
  populationScale: string;
  redMoonCountdown: number;
  player: {
    id: string; name: string; alive: boolean;
    health: number; maxHealth: number;
    mental: number; maxMental: number;
    stamina: number; maxStamina: number;
    hunger: number;
    combat: number; defense: number; agility: number;
    gold: number;
    attributes: Record<string, number>;
    skills: Array<{ name: string; level: number; experience: number }>;
    statusEffects: Array<{ type: string; magnitude: number; remainingTurns: number }>;
  };
  location: {
    id: string; name: string; region: string;
    description: string; isSafe: boolean;
    population: number; connectedLocations: string[];
  } | null;
  nearbyCharacters: Array<{ id: string; name: string; race: string; isCore: boolean; combat: number }>;
  stats: {
    aliveCore: number; totalCore: number;
    totalFactions: number; totalLocations: number;
    globalStability: number; globalFood: number;
  };
  recentNarrative: { body: string; mood: string } | null;
  actions: Array<{ kind: string; targetId?: string; label: string; cost: string; category: string }>;
}

export interface ActionItem {
  kind: string;
  targetId?: string;
  label: string;
  cost: string;
  category: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  /** 创建新游戏 */
  createGame: (data: { name: string; difficulty: string; populationScale: string; seed?: string }) =>
    request<GameResponse>('/game', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 获取游戏状态 */
  getGame: (id: string) =>
    request<GameResponse>(`/game/${id}`),

  /** 获取可用行动 */
  getActions: (id: string) =>
    request<{ actions: ActionItem[]; round: number; playerDead: boolean }>(`/game/${id}/actions`),

  /** 执行行动 */
  act: (id: string, action: { kind: string; targetId?: string; detail?: string; label?: string }) =>
    request<GameResponse>(`/game/${id}/act`, {
      method: 'POST',
      body: JSON.stringify(action),
    }),

  /** 获取完整日志 */
  getLog: (id: string) =>
    request<{ events: unknown[]; narratives: unknown[]; deaths: unknown[] }>(`/game/${id}/log`),
};
