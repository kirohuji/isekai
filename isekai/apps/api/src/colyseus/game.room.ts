import { Room, Client } from 'colyseus'
import { GameState, Player } from './game.state'
import { TurnManager } from '../engine/turn/turn-manager'
import { BUILTIN_ACTIONS } from '../engine/actions/builtin-actions'
import { Season, TimeBlock, Weather, getSeason } from '../engine/types'
import { NarrativeChoice, NarrativeService } from '../narrative/narrative.service'

/**
 * Colyseus 游戏房间
 *
 * 回合制文字冒险游戏的核心房间。
 * 集成 TurnManager + 门控引擎 + 规则系统。
 */
export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 8
  private turnManager = new TurnManager()
  private narrativeService = new NarrativeService()
  private narrativeHistory: Array<{ role: 'player' | 'narrator'; content: string }> = []
  private currentChoices: NarrativeChoice[] = []

  onCreate(_options: any) {
    this.setState(new GameState())
    console.log('[GameRoom] created:', this.roomId)

    this.turnManager.initialize({
      playerName: '旅者',
      locationId: 76,
      locationName: '王都·召唤广场',
      region: '王都神殿区',
      locationTags: ['city', 'outdoor', 'holy', 'summoning'],
      weather: Weather.晴朗,
      season: getSeason(3),
      year: 847,
      month: 3,
      day: 1,
      timeBlock: TimeBlock.上午,
      initialFoodDays: 0,
      initialMental: 90,
    })
    this.turnManager.registerActions(BUILTIN_ACTIONS)

    // 玩家选择了行动
    this.onMessage('action', (client, data: { actionId: string; customInput?: string }) => {
      console.log(`[GameRoom] action from ${client.sessionId}:`, data)

      if (data.actionId.startsWith('ai:')) {
        void this.continueNarrative(data.actionId.slice(3))
        return
      }

      // 用 TurnManager 执行完整回合
      const result = this.turnManager.executeTurn(data.actionId, data.customInput)

      // 推送叙事 + 行动列表（消息通道）
      this.broadcast('narrative', { text: result.narrative, turn: result.state.turn })
      this.broadcast('actions', result.actions)

      // 更新 Colyseus 结构化状态
      this.state.location = result.state.location
      this.state.region = result.state.region
      this.state.dateDisplay = result.state.dateDisplay
      this.state.timeBlock = result.state.timeBlock
      this.state.turn = result.state.turn
      this.state.isPlayerTurn = result.isPlayerTurn

      // 更新玩家状态
      const playerSchema = this.state.players.get(client.sessionId)
      if (playerSchema) {
        playerSchema.hp = result.state.hp
        playerSchema.maxHp = result.state.maxHp
        playerSchema.sp = result.state.sp
        playerSchema.maxSp = result.state.maxSp
        playerSchema.mp = result.state.mp
        playerSchema.maxMp = result.state.maxMp
        playerSchema.silver = result.state.silver
      }
    })
  }

  onJoin(client: Client) {
    console.log('[GameRoom] join:', client.sessionId)
    const player = new Player()
    player.sessionId = client.sessionId
    player.name = '旅者'
    this.state.players.set(client.sessionId, player)

    // 每局由 AI 主持人生成第一幕与场景化选项；网络故障时使用本地保底场景。
    setTimeout(() => void this.beginNarrative(), 500)
  }

  onLeave(client: Client) {
    console.log('[GameRoom] leave:', client.sessionId)
    this.state.players.delete(client.sessionId)
  }

  onDispose() {
    console.log('[GameRoom] disposed:', this.roomId)
  }

  pushNarrative(text: string): void {
    this.broadcast('narrative', { text, turn: this.state.turn })
  }

  pushNarrativeUpdate(text: string): void {
    this.broadcast('narrative_update', { text })
  }

  pushActions(actions: any[]): void {
    this.broadcast('actions', actions)
  }

  private async beginNarrative(): Promise<void> {
    this.narrativeHistory = []
    try {
      await this.generateNarrative()
    } catch (error) {
      console.error('[Narrative] opening generation failed:', error instanceof Error ? error.message : error)
      this.presentNarrative({
        narrative: '光芒熄灭时，你发现自己跪在一座陌生的白石圆厅中。五十名同学散落在发光的召唤阵边缘，灰袍神官正将人群分开。\n\n一名神官翻看木牌，平静地宣布你是“无能力者”。他把一袋安置金推到桌边，却没有解释你们为什么会在这里。',
        choices: [
          { id: 'ask_priest', label: '追问神官', description: '要求解释召唤与安置安排' },
          { id: 'watch_classmates', label: '观察同学的去向', description: '确认谁被神殿带离广场' },
        ],
      })
    }
  }

  private async continueNarrative(choiceId: string): Promise<void> {
    const choice = this.currentChoices.find(item => item.id === choiceId)
    if (!choice) return
    this.narrativeHistory.push({ role: 'player', content: choice.label })
    this.state.turn += 1
    try {
      await this.generateNarrative(choice.label)
    } catch (error) {
      console.error('[Narrative] continuation failed:', error instanceof Error ? error.message : error)
      this.pushNarrative('神官的目光停在你身上片刻，周围的嘈杂声却没有停止。你意识到，必须先弄清楚谁在安排这一切。')
      this.pushActions(this.currentChoices.map(item => ({ id: `ai:${item.id}`, title: item.label, description: item.description, category: '社交' })))
    }
  }

  private async generateNarrative(playerChoice?: string): Promise<void> {
    const ctx = this.turnManager.getContext()
    const beat = await this.narrativeService.generate({
      location: this.state.location,
      region: this.state.region,
      date: this.state.dateDisplay,
      timeBlock: this.state.timeBlock,
      turn: this.state.turn,
      player: { hp: ctx.player.hp, sp: ctx.player.sp, mp: ctx.player.mp, silver: ctx.player.silver, foodDays: ctx.player.foodDays },
      history: this.narrativeHistory.slice(-8),
      playerChoice,
    })
    this.presentNarrative(beat)
  }

  private presentNarrative(beat: { narrative: string; choices: NarrativeChoice[] }): void {
    this.currentChoices = beat.choices
    this.narrativeHistory.push({ role: 'narrator', content: beat.narrative })
    this.pushNarrative(beat.narrative)
    this.pushActions(beat.choices.map(choice => ({
      id: `ai:${choice.id}`, title: choice.label, description: choice.description, category: '叙事',
    })))
  }
}
