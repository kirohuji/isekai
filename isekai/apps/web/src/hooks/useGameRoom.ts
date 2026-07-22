import { useCallback, useEffect } from 'react'
import { useRoom, useRoomState } from '@colyseus/react'
import { client } from '@/colyseus/client'
import { useGameStore } from '@/stores/game.store'

/**
 * 连接 Colyseus 游戏房间
 *
 * Schema 只同步结构化状态（资源/位置/时段）。
 * 叙事文本和行动列表通过消息通道推送。
 */
export function useGameRoom() {
  const store = useGameStore()

  const { room, error, isConnecting } = useRoom(
    () => client.joinOrCreate('game'),
    [],
  )

  const state = useRoomState(room)

  // Schema 同步：结构化状态
  if (state) {
    store.setPlayerTurn(state.isPlayerTurn)
  }
  if (room && !isConnecting) {
    store.setConnected(true)
    store.setRoomId(room.roomId)
  }

  // 消息通道：叙事文本 + 行动列表
  useEffect(() => {
    if (!room) return

    const onNarrative = (msg: { text: string }) => store.setNarrative(msg.text)
    const onNarrativeUpdate = (msg: { text: string }) => store.setNarrative(msg.text)
    const onActions = (actions: string[]) => store.setActions(actions)

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
    (actionId: number, payload?: any) => room?.send('action', { actionId, ...payload }),
    [room],
  )

  return { room, error, isConnecting, sendAction }
}
