export interface NarrativeChoice {
  id: string
  label: string
  description: string
}

export interface NarrativeBeat {
  narrative: string
  choices: NarrativeChoice[]
}

export interface NarrativeContext {
  location: string
  region: string
  date: string
  timeBlock: string
  turn: number
  player: { hp: number; sp: number; mp: number; silver: number; foodDays: number }
  history: Array<{ role: 'player' | 'narrator'; content: string }>
  playerChoice?: string
}

/** DeepSeek 叙事主持人。模型只决定文本和选项；游戏状态仍由服务端持有。 */
export class NarrativeService {
  private readonly endpoint = 'https://api.deepseek.com/chat/completions'

  async generate(context: NarrativeContext): Promise<NarrativeBeat> {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        thinking: { type: 'disabled' },
        temperature: 0.8,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(context) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`DeepSeek 请求失败 (${response.status})`)

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('DeepSeek 未返回叙事内容')
    return validateBeat(JSON.parse(stripCodeFence(content)))
  }
}

const SYSTEM_PROMPT = `你是中文文字冒险《灰丘领主》的叙事主持人。世界：光明历847年，圣光王国与神殿刚将一班50名高中生召唤至异世界；主角是暂时无能力的普通人。神殿不可信但不能写成全知全能的纯恶组织。

你的职责是推动一条有因果、有目标的剧情，不要随机跳转地点、人物或事件。必须承接玩家刚刚的选择。开局阶段应围绕召唤广场、神官登记、同学分流与沈清岚的线索推进；不要突然出现灰丘、沼泽、魔化森林或末日建设。

根据输入 JSON 中的状态与最近历史，严格只返回 JSON：
{"narrative":"150到350字的第二人称中文叙事","choices":[{"id":"简短英文或拼音标识","label":"玩家可点击的明确选择","description":"8到24字说明"}]}

choices 必须为2到4个，彼此有真实取舍，且每个都必须是当前场景可立即执行的行为。不要输出 Markdown、解释、数值结算、隐藏思考，也不要让玩家选择未在叙事中出现的地点。`

function stripCodeFence(content: string): string {
  return content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '')
}

function validateBeat(value: unknown): NarrativeBeat {
  if (!value || typeof value !== 'object') throw new Error('叙事响应不是对象')
  const beat = value as { narrative?: unknown; choices?: unknown }
  if (typeof beat.narrative !== 'string' || !Array.isArray(beat.choices)) throw new Error('叙事响应字段不完整')
  const choices = beat.choices.slice(0, 4).map((choice, index) => {
    const c = choice as { id?: unknown; label?: unknown; description?: unknown }
    if (typeof c.label !== 'string') throw new Error('叙事选项缺少文本')
    return {
      id: typeof c.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(c.id) ? c.id : `choice_${index + 1}`,
      label: c.label.slice(0, 80),
      description: typeof c.description === 'string' ? c.description.slice(0, 80) : '',
    }
  })
  if (choices.length < 2) throw new Error('叙事选项不足')
  return { narrative: beat.narrative.slice(0, 2400), choices }
}
