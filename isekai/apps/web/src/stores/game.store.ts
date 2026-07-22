import { create } from 'zustand'

/** 游戏界面状态 */
interface GameStore {
  connected: boolean
  roomId: string | null
  narrative: string
  actions: string[]
  isPlayerTurn: boolean

  setConnected: (v: boolean) => void
  setRoomId: (id: string | null) => void
  setNarrative: (t: string) => void
  setActions: (a: string[]) => void
  setPlayerTurn: (v: boolean) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  connected: false,
  roomId: null,
  narrative: '',
  actions: [],
  isPlayerTurn: false,

  setConnected: (v) => set({ connected: v }),
  setRoomId: (id) => set({ roomId: id }),
  setNarrative: (t) => set({ narrative: t }),
  setActions: (a) => set({ actions: a }),
  setPlayerTurn: (v) => set({ isPlayerTurn: v }),
  reset: () => set({ connected: false, roomId: null, narrative: '', actions: [], isPlayerTurn: false }),
}))
