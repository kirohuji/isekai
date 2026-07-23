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
    location: '王都·召唤广场', region: '王都神殿区',
    dateDisplay: '光明历847年 三月 第1天', timeBlock: '上午',
    hp: 100, maxHp: 100, sp: 100, maxSp: 100,
    mp: 90, maxMp: 100, silver: 120, foodDays: 0,
    weather: '晴朗', season: '春', turn: 0,
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-4 py-5 lg:py-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
        <main className="flex min-h-[68vh] flex-col rounded-lg border border-border bg-background/50">
          <header className="border-b border-border px-5 py-4">
            <p className="text-xs tracking-[0.22em] text-primary">异世界生存叙事</p>
            <h1 className="mt-1 text-lg font-semibold">灰丘领主</h1>
          </header>
          <NarrativePanel text={narrative} />
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <StatusBar
            location={gs.location}
            region={gs.region}
            dateDisplay={gs.dateDisplay}
            timeBlock={gs.timeBlock}
            hp={gs.hp} maxHp={gs.maxHp}
            sp={gs.sp} maxSp={gs.maxSp}
            mp={gs.mp} maxMp={gs.maxMp}
            silver={gs.silver}
            foodDays={gs.foodDays}
            weather={gs.weather}
            season={gs.season}
            turn={gs.turn}
          />
          <ActionPanel
            actions={actions}
            onSelect={(id) => sendAction(id)}
            disabled={false}
          />
        </aside>
      </div>
    </div>
  )
}
