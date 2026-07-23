import { useCallback, useEffect } from 'react'
import { useRoom, useRoomState } from '@colyseus/react'
import { client } from '@/colyseus/client'
import { useGameStore } from '@/stores/game.store'

type PlayerState = {
  hp?: number; maxHp?: number; sp?: number; maxSp?: number
  mp?: number; maxMp?: number; silver?: number; foodDays?: number
}

export function useGameRoom() {
  const { room, error, isConnecting } = useRoom(
    () => client.joinOrCreate('game'),
    [],
  )

  const state = useRoomState(room)

  useEffect(() => {
    if (!state) return

    const sessionId = room?.sessionId ?? ''
    const players = state.players as Record<string, PlayerState> | Map<string, PlayerState> | undefined
    const player = players instanceof Map
      ? players.get(sessionId)
      : players?.[sessionId]
    const store = useGameStore.getState()
    store.setPlayerTurn(state.isPlayerTurn)
    store.setGameState({
      location: state.location, region: state.region,
      dateDisplay: state.dateDisplay, timeBlock: state.timeBlock,
      hp: player?.hp ?? 100, maxHp: player?.maxHp ?? 100,
      sp: player?.sp ?? 100, maxSp: player?.maxSp ?? 100,
      mp: player?.mp ?? 100, maxMp: player?.maxMp ?? 100,
      silver: player?.silver ?? 120, foodDays: player?.foodDays ?? 7,
      weather: '晴朗', season: '秋', turn: state.turn,
    })
  }, [state, room?.sessionId])

  useEffect(() => {
    if (!room || isConnecting) return

    const store = useGameStore.getState()
    store.setConnected(true)
    store.setRoomId(room.roomId)
  }, [room, isConnecting])

  useEffect(() => {
    if (!room) return
    const onNarrative = (msg: { text: string }) => {
      const store = useGameStore.getState()
      store.setNarrative(msg.text)
      store.appendNarrative(msg.text)
    }
    const onNarrativeUpdate = (msg: { text: string }) => useGameStore.getState().setNarrative(msg.text)
    const onActions = (actions: any[]) => useGameStore.getState().setActions(actions)
    const offNarrative = room.onMessage('narrative', onNarrative)
    const offNarrativeUpdate = room.onMessage('narrative_update', onNarrativeUpdate)
    const offActions = room.onMessage('actions', onActions)
    return () => {
      offNarrative()
      offNarrativeUpdate()
      offActions()
    }
  }, [room])

  const sendAction = useCallback(
    (actionId: string, customInput?: string) => room?.send('action', { actionId, customInput }),
    [room],
  )

  return { room, error, isConnecting, sendAction }
}
