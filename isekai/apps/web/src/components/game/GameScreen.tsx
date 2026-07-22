import { StatusBar } from './StatusBar'
import { NarrativePanel } from './NarrativePanel'
import { ActionPanel } from './ActionPanel'
import { useGameRoom } from '@/hooks/useGameRoom'
import { useGameStore } from '@/stores/game.store'

export function GameScreen() {
  const { isConnecting, error, sendAction } = useGameRoom()
  const { narrative, actions, gameState } = useGameStore()

  if (error) {
    return (
      <div className="game-container flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-red-400 text-lg">⚠️ 连接失败</p>
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

  const gs = gameState ?? {
    location: '灰丘', region: '东南边境',
    dateDisplay: '光明历847年 九月 第15天', timeBlock: '清晨',
    hp: 100, maxHp: 100, sp: 100, maxSp: 100,
    mp: 100, maxMp: 100, silver: 120, foodDays: 7,
    weather: '晴朗', season: '秋', turn: 0,
  }

  return (
    <div className="flex flex-col gap-3 min-h-screen py-6 max-w-3xl mx-auto px-4">
      <StatusBar
        location={gs.location}
        region={gs.region}
        dateDisplay={gs.dateDisplay}
        timeBlock={gs.timeBlock}
        hp={gs.hp} maxHp={gs.maxHp}
        sp={gs.sp} maxSp={gs.maxSp}
        mp={gs.mp} maxMp={gs.maxMp}
        silver={gs.silver}
        weather={gs.weather}
        season={gs.season}
      />
      <NarrativePanel text={narrative} />
      <ActionPanel
        actions={actions}
        onSelect={(id) => sendAction(id)}
        disabled={false}
      />
    </div>
  )
}
