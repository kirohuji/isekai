// ============================================
// 天气系统：天气生成 + 季节权重
// ============================================
import { Weather, Season, type TurnContext } from '../types'

const WEATHER_BY_SEASON: Record<Season, Array<{ weather: Weather; weight: number }>> = {
  [Season.春]: [{ weather: Weather.晴朗, weight: 20 }, { weather: Weather.多云, weight: 25 }, { weather: Weather.小雨, weight: 30 }, { weather: Weather.大雨, weight: 15 }, { weather: Weather.雾, weight: 10 }],
  [Season.夏]: [{ weather: Weather.晴朗, weight: 35 }, { weather: Weather.多云, weight: 20 }, { weather: Weather.小雨, weight: 10 }, { weather: Weather.暴雨, weight: 10 }, { weather: Weather.酷热, weight: 25 }],
  [Season.秋]: [{ weather: Weather.晴朗, weight: 25 }, { weather: Weather.多云, weight: 20 }, { weather: Weather.小雨, weight: 20 }, { weather: Weather.大雨, weight: 15 }, { weather: Weather.雾, weight: 20 }],
  [Season.冬]: [{ weather: Weather.晴朗, weight: 20 }, { weather: Weather.多云, weight: 25 }, { weather: Weather.阴天, weight: 20 }, { weather: Weather.寒潮, weight: 25 }],
}

export class WeatherSystem {
  private turnSinceLastChange = 0

  update(ctx: TurnContext): void {
    this.turnSinceLastChange++
    // 每 5+ 回合有机会切换
    if (this.turnSinceLastChange < 5 + Math.floor(Math.random() * 5)) return
    // 60% 维持
    if (Math.random() < 0.6) return

    const newWeather = this.rollWeather(ctx.season, ctx.weather)
    if (newWeather && newWeather !== ctx.weather) {
      ctx.weather = newWeather
      this.turnSinceLastChange = 0
      ctx.narrativeFragments.push({ text: `天气转为了${newWeather}。`, priority: 4, source: 'weather' })
    }
  }

  private rollWeather(season: Season, current: Weather): Weather | null {
    const weights = WEATHER_BY_SEASON[season].filter(w => w.weather !== current)
    const total = weights.reduce((s, w) => s + w.weight, 0)
    let roll = Math.random() * total
    for (const w of weights) { roll -= w.weight; if (roll <= 0) return w.weather }
    return null
  }
}
