/** 状态栏 — 显示地点、时间、资源 */
export function StatusBar({
  location, region, dateDisplay, timeBlock,
  hp, maxHp, sp, maxSp, mp, maxMp, silver,
  weather, season,
}: {
  location: string; region: string; dateDisplay: string; timeBlock: string
  hp: number; maxHp: number; sp: number; maxSp: number; mp: number; maxMp: number
  silver: number; weather: string; season: string
}) {
  return (
    <div className="border border-border rounded p-3 space-y-1.5 text-xs">
      <div className="flex justify-between text-muted-foreground">
        <span>📍 {location} · {region}</span>
        <span>🕐 {dateDisplay} · {timeBlock}</span>
      </div>
      <div className="flex justify-between">
        <div className="flex gap-4">
          <Bar label="❤️" value={hp} max={maxHp} color="text-red-400" />
          <Bar label="⚡" value={sp} max={maxSp} color="text-yellow-400" />
          <Bar label="🧠" value={mp} max={maxMp} color="text-blue-400" />
        </div>
        <div className="flex gap-3 text-muted-foreground">
          <span>💰 {silver}</span>
          <span>🌤 {weather}</span>
          <span>{season}</span>
        </div>
      </div>
    </div>
  )
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={color}>{label}</span>
      <div className="h-2 w-14 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%`, opacity: 0.6 }}
        />
      </div>
      <span className="text-muted-foreground w-12 tabular-nums">{value}/{max}</span>
    </div>
  )
}
