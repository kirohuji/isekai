import { useCallback, useEffect } from 'react'
import { useRoom, useRoomState } from '@colyseus/react'
import { client } from '@/colyseus/client'
import { useGameStore } from '@/stores/game.store'

export function useGameRoom() {
  const store = useGameStore()

  const { room, error, isConnecting } = useRoom(
    () => client.joinOrCreate('game'),
    [],
  )

  const state = useRoomState(room)

  if (state) {
    store.setPlayerTurn(state.isPlayerTurn)
    store.setGameState({
      location: state.location, region: state.region,
      dateDisplay: state.dateDisplay, timeBlock: state.timeBlock,
      hp: state.players?.get(room?.sessionId || '')?.hp ?? 100,
      maxHp: state.players?.get(room?.sessionId || '')?.maxHp ?? 100,
      sp: state.players?.get(room?.sessionId || '')?.sp ?? 100,
      maxSp: state.players?.get(room?.sessionId || '')?.maxSp ?? 100,
      mp: state.players?.get(room?.sessionId || '')?.mp ?? 100,
      maxMp: state.players?.get(room?.sessionId || '')?.maxMp ?? 100,
      silver: state.players?.get(room?.sessionId || '')?.silver ?? 120,
      foodDays: state.players?.get(room?.sessionId || '')?.foodDays ?? 7,
      weather: '晴朗', season: '秋', turn: state.turn,
    })
  }
  if (room && !isConnecting) {
    store.setConnected(true)
    store.setRoomId(room.roomId)
  }

  useEffect(() => {
    if (!room) return
    const onNarrative = (msg: { text: string }) => {
      store.setNarrative(msg.text)
      store.appendNarrative(msg.text)
    }
    const onNarrativeUpdate = (msg: { text: string }) => store.setNarrative(msg.text)
    const onActions = (actions: any[]) => store.setActions(actions)
    room.onMessage('narrative', onNarrative)
    room.onMessage('narrative_update', onNarrativeUpdate)
    room.onMessage('actions', onActions)
    return () => {
      room.onMessage('narrative', () => {})
      room.onMessage('narrative_update', () => {})
      room.onMessage('actions', () => {})
    }
  }, [room, store])

  const sendAction = useCallback(
    (actionId: string, customInput?: string) => room?.send('action', { actionId, customInput }),
    [room],
  )

  return { room, error, isConnecting, sendAction }
}
  )

  return { room, error, isConnecting, sendAction }
}
