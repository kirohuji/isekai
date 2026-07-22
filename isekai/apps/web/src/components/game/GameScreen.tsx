import { StatusBar } from './StatusBar'
import { NarrativePanel } from './NarrativePanel'
import { ActionPanel } from './ActionPanel'
import { useGameRoom } from '@/hooks/useGameRoom'
import { useGameStore } from '@/stores/game.store'

/** 主游戏画面 */
export function GameScreen() {
  const { isConnecting, error, sendAction } = useGameRoom()
  const { narrative, actions, isPlayerTurn } = useGameStore()

  if (error) {
    return (
      <div className="game-container flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive text-lg">⚠️ 连接失败</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors"
          >
            重新连接
          </button>
        </div>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <div className="game-container flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg animate-pulse">连接中...</p>
          <p className="text-sm text-muted-foreground">正在进入异世界</p>
        </div>
      </div>
    )
  }

  return (
    <div className="game-container flex flex-col gap-3 min-h-screen py-6">
      {/* 状态栏 */}
      <StatusBar
        location="旧鹿角旅馆"
        region="王都平民区"
        dateDisplay="光明历847年 九月 第15天"
        timeBlock="清晨"
        hp={100} maxHp={100}
        sp={100} maxSp={100}
        mp={100} maxMp={100}
        silver={120}
      />

      {/* 叙事文本 */}
      <NarrativePanel text={narrative} />

      {/* 行动列表 */}
      <ActionPanel
        actions={actions}
        onSelect={(id) => sendAction(id)}
        disabled={!isPlayerTurn}
      />
    </div>
  )
}
