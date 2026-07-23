/** 主角状态面板 — 显示当前已由服务端同步的全部角色与世界信息 */
export function StatusBar({
  location, region, dateDisplay, timeBlock,
  hp, maxHp, sp, maxSp, mp, maxMp, silver,
  foodDays, weather, season, turn,
}: {
  location: string; region: string; dateDisplay: string; timeBlock: string
  hp: number; maxHp: number; sp: number; maxSp: number; mp: number; maxMp: number
  silver: number; foodDays: number; weather: string; season: string; turn: number
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/20 text-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs tracking-[0.16em] text-muted-foreground">主角档案</p>
        <div className="mt-1 flex items-center justify-between">
          <h2 className="font-semibold">旅者</h2>
          <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">异世界来者</span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-2.5">
          <Bar label="生命" icon="♥" value={hp} max={maxHp} color="bg-red-400" />
          <Bar label="体力" icon="ϟ" value={sp} max={maxSp} color="bg-amber-400" />
          <Bar label="精神" icon="◉" value={mp} max={maxMp} color="bg-sky-400" />
        </div>

        <div className="grid grid-cols-2 gap-2 border-y border-border py-3 text-xs">
          <Info label="银币" value={`${silver}`} icon="◎" />
          <Info label="存粮" value={`${foodDays} 天`} icon="◒" />
          <Info label="天气" value={weather} icon="☼" />
          <Info label="季节" value={season} icon="✦" />
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="flex gap-2"><span>⌖</span><span>{location}<br />{region}</span></p>
          <p className="flex gap-2"><span>◷</span><span>{dateDisplay} · {timeBlock}</span></p>
          <p className="flex gap-2"><span>↻</span><span>第 {turn} 回合</span></p>
        </div>
      </div>
    </section>
  )
}

function Bar({ label, icon, value, max, color }: { label: string; icon: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground"><span className="mr-1.5">{icon}</span>{label}</span>
        <span className="tabular-nums">{value}/{max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Info({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="rounded bg-background/50 px-2 py-1.5"><span className="text-muted-foreground">{icon} {label}</span><p className="mt-0.5 font-medium">{value}</p></div>
}
