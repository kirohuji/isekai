import { create } from 'zustand'

interface GameAction {
  id: string; title: string; description: string
  category: string; reason?: string
}

interface GameState {
  location: string; region: string; dateDisplay: string; timeBlock: string
  hp: number; maxHp: number; sp: number; maxSp: number
  mp: number; maxMp: number; silver: number; foodDays: number
  weather: string; season: string; turn: number
}

interface GameStore {
  connected: boolean; roomId: string | null
  narrative: string; actions: GameAction[]
  isPlayerTurn: boolean; gameState: GameState | null
  narrativeHistory: string[]

  setConnected: (v: boolean) => void; setRoomId: (id: string | null) => void
  setNarrative: (t: string) => void; setActions: (a: GameAction[]) => void
  setPlayerTurn: (v: boolean) => void; setGameState: (s: GameState) => void
  appendNarrative: (t: string) => void; reset: () => void
}

const defaultState: GameState = {
  location: '灰丘', region: '东南边境',
  dateDisplay: '光明历847年 九月 第15天', timeBlock: '清晨',
  hp: 100, maxHp: 100, sp: 100, maxSp: 100,
  mp: 100, maxMp: 100, silver: 120, foodDays: 7,
  weather: '晴朗', season: '秋', turn: 0,
}

export const useGameStore = create<GameStore>((set) => ({
  connected: false, roomId: null,
  narrative: '', actions: [], isPlayerTurn: false, gameState: defaultState,
  narrativeHistory: [],

  setConnected: (v) => set({ connected: v }),
  setRoomId: (id) => set({ roomId: id }),
  setNarrative: (t) => set({ narrative: t }),
  setActions: (a) => set({ actions: a }),
  setPlayerTurn: (v) => set({ isPlayerTurn: v }),
  setGameState: (s) => set({ gameState: s }),
  appendNarrative: (t) => set((prev) => ({
    narrativeHistory: [...prev.narrativeHistory, t],
  })),
  reset: () => set({
    connected: false, roomId: null, narrative: '', actions: [],
    isPlayerTurn: false, gameState: defaultState, narrativeHistory: [],
  }),
}))
