import { Injectable } from '@nestjs/common';

/**
 * DeepSeek AI 服务
 * 用于：
 * 1. 生成回合叙事（基于事件事实） 
 * 2. 生成动态行动建议（基于玩家状态+环境）
 * 3. 帮助NPC做AI辅助决策
 * 
 * 模型: deepseek-chat (DeepSeek V4 Flash)
 */
@Injectable()
export class AIService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.deepseek.com';
  private readonly model = 'deepseek-v4-flash';

  constructor() {
    this.apiKey = process.env['DEEPSEEK_API_KEY'] ?? '';
    if (!this.apiKey) {
      console.warn('⚠ DEEPSEEK_API_KEY 未设置，将使用模板叙事。');
    }
  }

  get isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * 生成回合叙事
   */
  async generateNarrative(context: NarrativeContext): Promise<{ body: string; mood: string }> {
    if (!this.isAvailable) return this.fallbackNarrative(context);

    const prompt = this.buildNarrativePrompt(context);
    try {
      const response = await this.chat(prompt, 0.8);
      return this.parseNarrativeResponse(response);
    } catch (e) {
      console.error('AI叙事生成失败，回退到模板:', e);
      return this.fallbackNarrative(context);
    }
  }

  /**
   * 生成动态行动选项
   * 基于玩家数值、性格、周围环境生成沉浸式行动
   */
  async generateDynamicActions(context: ActionContext): Promise<DynamicAction[]> {
    if (!this.isAvailable) return [];

    const prompt = this.buildActionPrompt(context);
    try {
      const response = await this.chat(prompt, 0.7);
      return this.parseActionResponse(response);
    } catch (e) {
      console.error('AI行动生成失败:', e);
      return [];
    }
  }

  /**
   * 为NPC生成AI辅助决策
   */
  async generateNpcDecisions(context: NpcDecisionContext): Promise<string> {
    if (!this.isAvailable) return '按自身计划行动';
    
    const prompt = this.buildNpcDecisionPrompt(context);
    try {
      return await this.chat(prompt, 0.6);
    } catch {
      return '按自身计划行动';
    }
  }

  /**
   * 生成世界种子数据（初始化时调用，增加随机性）
   */
  async generateWorldSeed(context: WorldSeedContext): Promise<WorldSeedResult> {
    if (!this.isAvailable) return this.fallbackWorldSeed(context);
    const prompt = this.buildWorldSeedPrompt(context);
    try { const r = await this.chat(prompt, 0.9, 2000); return this.parseWorldSeedResponse(r); }
    catch (e) { console.error('AI世界种子生成失败:', e); return this.fallbackWorldSeed(context); }
  }

  /**
   * 每5回合的世界回顾——分析因果链与蝴蝶效应
   * 检查过去5回合的事件如何相互影响、玩家的小选择如何产生涟漪
   */
  async generateWorldReview(context: WorldReviewContext): Promise<WorldReviewResult> {
    if (!this.isAvailable) return this.fallbackWorldReview(context);
    const prompt = this.buildWorldReviewPrompt(context);
    try { const r = await this.chat(prompt, 0.7, 2000); return this.parseWorldReviewResponse(r); }
    catch (e) { console.error('AI世界回顾生成失败:', e); return this.fallbackWorldReview(context); }
  }

  /**
   * AI生成初始规则：开局时生成天气、地点、背景规则
   */
  async generateInitialRules(context: { locationName: string; locationType: string; weather: string; difficulty: string; playerOccupation: string }): Promise<RuleSuggestion[]> {
    if (!this.isAvailable) return [];
    const prompt = `你是游戏规则生成器。基于以下开局参数，生成3-5条"规则"来增加游戏趣味。每条规则 = 条件 → 效果。

开局参数：
- 位置：${context.locationName}（${context.locationType}）
- 天气：${context.weather}
- 难度：${context.difficulty}
- 主角职业：${context.playerOccupation}

规则格式（输出严格JSON数组）：
[
  {
    "name": "规则名（短，10字内）",
    "description": "规则描述（玩家可读，20字内）",
    "category": "location或weather或world",
    "conditions": [{"type":"条件类型","params":{"key":"value"}}],
    "effects": [{"type":"效果类型","params":{"key":"value"}}],
    "duration": 回合数(0=永久),
    "priority": 1-10
  }
]

可用条件类型：location_type, location_has, weather_is, phase_is, random_chance, every_n_rounds, has_status, player_did
可用效果类型：stat_mod, add_status, narrative_hint, weather_change, modify_action_cost, unlock_action, lock_action, trigger_event, daily_income_mod

请生成符合开局场景的趣味规则：`;

    try {
      const r = await this.chat(prompt, 0.85, 1500);
      const cleaned = r.replace(/```json\n?|```/g, '').trim();
      return JSON.parse(cleaned) as RuleSuggestion[];
    } catch { return []; }
  }

  /**
   * AI事件触发器：当条件满足时，AI决定触发什么
   */
  async generateEventTrigger(context: { round: number; day: number; phase: string; locationName: string; playerName: string; recentEvents: string[] }): Promise<RuleSuggestion | null> {
    if (!this.isAvailable) return null;
    const prompt = `你是游戏事件触发器。基于当前状态，判断是否应该触发一个特殊事件。如果是，返回一条规则；如果不是，返回null。

当前状态：
- 回合${context.round}，第${context.day}天·${context.phase}
- 位置：${context.locationName}
- 玩家：${context.playerName}
- 最近事件：${context.recentEvents.join('；') || '无特殊事件'}

请判断：现在是否需要触发一个特殊事件来增加游戏趣味？如果需要，返回JSON规则（同上格式，category用"event"）；如果不需要，返回字符串"null"。`;
    try {
      const r = await this.chat(prompt, 0.7, 800);
      if (r.trim() === 'null') return null;
      const cleaned = r.replace(/```json\n?|```/g, '').trim();
      return JSON.parse(cleaned) as RuleSuggestion;
    } catch { return null; }
  }

  // ============================================================
  // 内部
  // ============================================================

  private async chat(prompt: string, temperature: number, maxTokens = 1200): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  private buildNarrativePrompt(ctx: NarrativeContext): string {
    return `你是异世界生存游戏的叙事AI。基于以下事实，用主角视角生成一段沉浸式叙事（150-400字）。风格：冷峻、务实、文学性强，避免中二和过度浪漫。

【当前状态】
- 主角：${ctx.playerName}，无能力的召唤者
- 位置：${ctx.locationName}（${ctx.locationRegion}）
- 时间：第${ctx.day}天·${ctx.phase}（回合${ctx.round}）
- 生命${ctx.playerStats.health}/100 体力${ctx.playerStats.stamina}/100 精神${ctx.playerStats.mental}/100 饥饿${ctx.playerStats.hunger}/100
- 金币：${ctx.playerStats.gold}

【本回合事件】
${ctx.events.map(e => `- ${e}`).join('\n')}

【附近人物】
${ctx.nearbyChars.map(c => `- ${c}`).join('\n') || '无人'}

【难度】${ctx.difficulty}
【玩家行动】${ctx.playerAction}

请输出JSON格式：{"body":"叙事文本","mood":"mood_keyword"}
mood可选：grim/hopeful/tense/calm/mysterious/neutral`;
  }

  private buildActionPrompt(ctx: ActionContext): string {
    return `你是异世界生存游戏的AI。基于主角当前状态和环境，生成3-5个符合情境的独特行动选项。这些行动是常规行动之外的、基于情境的沉浸式选择。

【主角状态】
- ${ctx.playerName}，无能力者
- 生命${ctx.playerStats.health}/100 体力${ctx.playerStats.stamina}/100 精神${ctx.playerStats.mental}/100
- 属性：洞察${ctx.attributes.insight} 冷静${ctx.attributes.composure} 坚韧${ctx.attributes.tenacity} 魅力${ctx.attributes.charisma} 智谋${ctx.attributes.cunning}

【环境】
- 位置：${ctx.locationName}（${ctx.locationDesc}）
- 安全：${ctx.isSafe ? '是' : '否'}
- 附近：${ctx.nearbySummary}

【当前局势】
${ctx.situationSummary}

请生成JSON数组，每个行动包含：
- kind: 行动类型(move/rest/work/explore/socialize/build/trade/combat/scout/hunt/gather/craft/study/pray/wait)
- label: 沉浸式行动描述（中文，10-30字）
- detail: 额外细节（可选，中文）
- reason: AI为什么建议这个行动（一句话，不给玩家看）
- targetId: 目标地点/NPC ID（可选）

输出格式：\`\`\`json\n[{...},...]\n\`\`\``;
  }

  private buildNpcDecisionPrompt(ctx: NpcDecisionContext): string {
    return `你是NPC行为决策AI。基于NPC的状况和环境决定其本回合应该做什么。请只返回一行简短的中文行动描述。

NPC：${ctx.npcName}（${ctx.npcRace}，${ctx.npcRole}）
状态：生命${ctx.npcStats.health}/100 体力${ctx.npcStats.stamina}/100 饥饿${ctx.npcStats.hunger}/100
势力：${ctx.npcFaction}
位置：${ctx.npcLocation}
性格简述：${ctx.npcDesc}

请回复一个简短行动（如"前往集市购买粮食"或"原地休整恢复体力"或"侦察周边威胁"等）：`;
  }

  private parseNarrativeResponse(raw: string): { body: string; mood: string } {
    try {
      const j = JSON.parse(raw.trim().replace(/```json\n?|```/g, ''));
      return { body: j.body ?? raw, mood: j.mood ?? 'neutral' };
    } catch { return { body: raw, mood: 'neutral' }; }
  }

  private parseActionResponse(raw: string): DynamicAction[] {
    try {
      const cleaned = raw.replace(/```json\n?|```/g, '').trim();
      const arr = JSON.parse(cleaned);
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, 5).map(a => ({
        kind: a.kind ?? 'wait',
        label: a.label ?? '未命名行动',
        detail: a.detail ?? '',
        reason: a.reason ?? '',
        targetId: a.targetId,
      }));
    } catch { return []; }
  }

  private fallbackNarrative(ctx: NarrativeContext): { body: string; mood: string } {
    const body = [
      `第${ctx.round}回合 · 第${ctx.day}天 · ${ctx.phase}`,
      `${ctx.locationName}，${ctx.locationRegion}。`,
      ctx.events.length > 0 ? ctx.events.map(e => `▸ ${e}`).join('\n') : '',
      `你选择了：${ctx.playerAction}`,
      `❤${ctx.playerStats.health}/100 ⚡${ctx.playerStats.stamina}/100 🧠${ctx.playerStats.mental}/100 🍖${ctx.playerStats.hunger}/100`,
    ].filter(Boolean).join('\n\n');
    return { body, mood: 'neutral' };
  }

  // ---- 世界种子生成 ----

  private buildWorldSeedPrompt(ctx: WorldSeedContext): string {
    return `你是异世界生存游戏的随机世界生成器。请为游戏开局生成随机的世界风味数据，增加每次开局的新鲜感。

【基础参数】
- 王国大小：${ctx.populationScale}（${ctx.totalPop}人口）
- 难度：${ctx.difficulty}
- 主角职业背景：${ctx.playerOccupation}
- 起始位置：${ctx.startLocation}

【请生成以下随机数据，全部使用中文】：

1. **3个近期传闻**（正在王国中流传的消息，每条约20字，可以是真或假）
2. **2个特殊地点描述**（在起始位置附近的有趣场所，含名字和一句话描述）
3. **1-2个随机事件种子**（可能在头几回合触发的小事件简述，15字以内）
4. **2-3个NPC变体名**（给随机NPC取的独特名字，带有异世界风味）
5. **当前季节天气**（根据光明历847年三月，给出季节和当日天气描述）

请输出严格JSON格式：
{
  "rumors": ["传闻1", "传闻2", "传闻3"],
  "specialPlaces": [{"name":"地点名","desc":"一句话描述"}],
  "eventSeeds": ["事件简述1","事件简述2"],
  "npcNames": ["名字1","名字2","名字3"],
  "seasonWeather": "季节天气描述"
}`;
  }

  private parseWorldSeedResponse(raw: string): WorldSeedResult {
    try {
      const j = JSON.parse(raw.trim().replace(/```json\n?|```/g, ''));
      return {
        rumors: j.rumors ?? [],
        specialPlaces: j.specialPlaces ?? [],
        eventSeeds: j.eventSeeds ?? [],
        npcNames: j.npcNames ?? [],
        seasonWeather: j.seasonWeather ?? '初春，料峭寒风中带着泥土的气息',
      };
    } catch { return this.fallbackWorldSeed({} as WorldSeedContext); }
  }

  private fallbackWorldSeed(_ctx: WorldSeedContext): WorldSeedResult {
    return {
      rumors: ['据说王都城外的沼泽最近出现了新的魔物巢穴', '北门集市有商人在暗中收购亚人奴隶', '神殿最近频繁调动灰袍守卫，原因不明'],
      specialPlaces: [{ name: '旧钟楼废墟', desc: '一座废弃的钟楼，楼梯已经塌了一半，但顶层可以看见半个王都。' }],
      eventSeeds: ['路边发现可疑的脚印', '集市上有神秘商人兜售来历不明的药草'],
      npcNames: ['铁锤·鲁格', '风语者·艾琳', '独眼的瓦里克'],
      seasonWeather: '初春三月，料峭寒风中带着泥土和烟尘的气息，灰蒙蒙的天色预示着雨季将至',
    };
  }

  // ---- 世界回顾（每5回合） ----

  private buildWorldReviewPrompt(ctx: WorldReviewContext): string {
    const events = ctx.recentEvents.map((e, i) => `  回合${e.round}：[${e.type}] ${e.desc}`).join('\n');
    const deaths = ctx.recentDeaths.map(d => `  ${d.name} 因 ${d.reason} 死亡（回合${d.round}）`).join('\n');
    const factions = ctx.factionChanges.map(f => `  ${f.name}：${f.change}`).join('\n');

    return `你是异世界同步回合制生存游戏的"世界回顾"AI。所有人的行动在同一回合内同步执行，因此事件的因果链非常紧密——蝴蝶效应极强。

请基于以下过去5回合的数据，写一段"世界脉动"分析（200-300字），包含：

1. **因果链**：哪些看似无关的事件实际上有因果联系？（例如：A地某人死亡→B地物价波动→C势力的决策改变）
2. **蝴蝶效应**：有没有玩家的小选择产生了意想不到的远程影响？
3. **世界趋势**：当前世界在往哪个方向发展？（更危险/更稳定/某个势力在崛起）
4. **玩家处境评估**：考虑到世界趋势，玩家应该关注什么？

【基本状态】
- 当前回合：${ctx.currentRound}，第${ctx.currentDay}天
- 难度：${ctx.difficulty}，人口：${ctx.totalPop}
- 玩家：${ctx.playerName}，位于${ctx.playerLocation}
- 存活核心角色：${ctx.aliveCore}/${ctx.totalCore}
- 红月倒计时：约${ctx.redMoonCountdown}天

【过去5回合所有事件（按回合排列，同一回合的事件同步发生）】
${events || '(无特殊事件)'}

【死亡记录】
${deaths || '(无人死亡)'}

【势力变化】
${factions || '(无明显变化)'}

【玩家行动序列】
${ctx.playerActions.map((a, i) => `  回合${a.round}：${a.action}`).join('\n')}

请输出JSON：
{
  "title": "世界脉动的标题（10字以内，如'涟漪扩散'、'暗流涌动'、'命运的编织'等）",
  "causalChain": "因果链分析文本（80-120字）",
  "butterflyEffect": "蝴蝶效应分析文本（60-100字）",
  "worldTrend": "世界趋势判断（40-60字）",
  "playerAdvice": "给玩家的建议（30-50字，以角色视角）",
  "mood": "氛围词（ominous/hopeful/tense/chaotic/calm）"
}`;
  }

  private parseWorldReviewResponse(raw: string): WorldReviewResult {
    try {
      const j = JSON.parse(raw.trim().replace(/```json\n?|```/g, ''));
      return {
        title: j.title ?? '世界脉动',
        causalChain: j.causalChain ?? '',
        butterflyEffect: j.butterflyEffect ?? '',
        worldTrend: j.worldTrend ?? '',
        playerAdvice: j.playerAdvice ?? '',
        mood: j.mood ?? 'tense',
      };
    } catch { return this.fallbackWorldReview({} as WorldReviewContext); }
  }

  private fallbackWorldReview(ctx: WorldReviewContext): WorldReviewResult {
    const aliveRatio = ctx.aliveCore / Math.max(1, ctx.totalCore);
    const mood = aliveRatio > 0.8 ? 'calm' : aliveRatio > 0.5 ? 'tense' : 'ominous';

    return {
      title: '世界脉动',
      causalChain: `过去5个回合中，世界按照同步时间线推进了${ctx.currentRound - (ctx.recentEvents[0]?.round ?? ctx.currentRound)}步。每个人的选择在同一时刻交织——有些因果链已经显现，有些还需等待时间的揭示。`,
      butterflyEffect: `在世界同步运转的机制下，每一个微小的选择都可能被放大。你所做的决定，正在以你尚未察觉的方式影响着世界的走向。`,
      worldTrend: `世界在缓慢但确定地变化。${ctx.redMoonCountdown < 100 ? '红月倒计时紧迫，各方势力都在为末日的到来做准备。' : '目前局势尚可，但不安的暗流已在涌动。'}`,
      playerAdvice: '留意你周围的每一个人——在这个同步的世界里，没有人是孤岛。',
      mood,
    };
  }
}

// ============================================================
// 类型
// ============================================================

export interface NarrativeContext {
  playerName: string;
  locationName: string;
  locationRegion: string;
  day: number;
  phase: string;
  round: number;
  playerStats: { health: number; stamina: number; mental: number; hunger: number; gold: number };
  events: string[];
  nearbyChars: string[];
  difficulty: string;
  playerAction: string;
}

export interface ActionContext {
  playerName: string;
  playerStats: { health: number; stamina: number; mental: number; hunger: number };
  attributes: { insight: number; composure: number; tenacity: number; charisma: number; cunning: number };
  locationName: string;
  locationDesc: string;
  isSafe: boolean;
  nearbySummary: string;
  situationSummary: string;
}

export interface DynamicAction {
  kind: string;
  label: string;
  detail: string;
  reason: string;
  targetId?: string;
}

export interface NpcDecisionContext {
  npcName: string;
  npcRace: string;
  npcRole: string;
  npcStats: { health: number; stamina: number; hunger: number };
  npcFaction: string;
  npcLocation: string;
  npcDesc: string;
}

export interface WorldSeedContext {
  populationScale: string;
  totalPop: string;
  difficulty: string;
  playerOccupation: string;
  startLocation: string;
}

export interface WorldSeedResult {
  rumors: string[];
  specialPlaces: Array<{ name: string; desc: string }>;
  eventSeeds: string[];
  npcNames: string[];
  seasonWeather: string;
}

/** 世界回顾（每5回合） */
export interface WorldReviewContext {
  currentRound: number;
  currentDay: number;
  difficulty: string;
  totalPop: string;
  playerName: string;
  playerLocation: string;
  aliveCore: number;
  totalCore: number;
  redMoonCountdown: number;
  recentEvents: Array<{ round: number; type: string; desc: string }>;
  recentDeaths: Array<{ name: string; reason: string; round: number }>;
  factionChanges: Array<{ name: string; change: string }>;
  playerActions: Array<{ round: number; action: string }>;
}

export interface WorldReviewResult {
  title: string; causalChain: string; butterflyEffect: string;
  worldTrend: string; playerAdvice: string; mood: string;
}

/** AI生成的规则建议 */
export interface RuleSuggestion {
  name: string; description: string; category: string;
  conditions: Array<{ type: string; params: Record<string, unknown> }>;
  effects: Array<{ type: string; params: Record<string, unknown> }>;
  duration: number; priority: number;
}

// ============================================================
// 主角职业背景（开局可选）
// ============================================================
export const PROTAGONIST_OCCUPATIONS: Array<{
  id: string;
  name: string;
  desc: string;
  attributeBonus: Record<string, number>;
  startingSkills: string[];
  startingGoldBonus: number;
}> = [
  {
    id: 'student', name: '普通高中生', desc: '穿越前只是个普通高三学生。没有特殊技能，但适应力强，学东西快。',
    attributeBonus: { insight: 2, composure: 2, tenacity: 1, charisma: 0, cunning: 1 },
    startingSkills: ['策略·危机判断', '知识·现代常识'],
    startingGoldBonus: 0,
  },
  {
    id: 'accounting', name: '会计科代表', desc: '三年记账经验。对数字敏感，善于发现账目中的漏洞和成本优化。',
    attributeBonus: { insight: 1, composure: 2, tenacity: 0, charisma: 0, cunning: 3 },
    startingSkills: ['经商·账目计算', '策略·成本分析', '知识·税务漏洞'],
    startingGoldBonus: 15,
  },
  {
    id: 'debateteam', name: '辩论队队长', desc: '三年辩论经验。擅长说服、谈判和快速拆解对方逻辑。',
    attributeBonus: { insight: 2, composure: 3, tenacity: 0, charisma: 2, cunning: 1 },
    startingSkills: ['社交·谈判', '社交·说服', '策略·逻辑分析'],
    startingGoldBonus: 5,
  },
  {
    id: 'medstudent', name: '医学预科生', desc: '父母都是医生，从小耳濡目染。懂得基础医学知识和急救处理。',
    attributeBonus: { insight: 3, composure: 2, tenacity: 1, charisma: 0, cunning: 0 },
    startingSkills: ['知识·现代医学基础', '知识·草药识别', '生存·急救'],
    startingGoldBonus: 0,
  },
  {
    id: 'athlete', name: '田径部王牌', desc: '省级短跑亚军。体力充沛，反应敏捷，习惯了高强度训练。',
    attributeBonus: { insight: 0, composure: 2, tenacity: 3, charisma: 1, cunning: 0 },
    startingSkills: ['生存·体能管理', '战斗·基础防身'],
    startingGoldBonus: 0,
  },
  {
    id: 'programmer', name: '编程竞赛生', desc: '信息学奥赛省一等奖。擅长系统思维和流程优化——但这个世界没有电脑。',
    attributeBonus: { insight: 1, composure: 2, tenacity: 0, charisma: 0, cunning: 4 },
    startingSkills: ['策略·系统分析', '策略·流程优化', '知识·逻辑推演'],
    startingGoldBonus: 5,
  },
  {
    id: 'farmkid', name: '农村寄宿生', desc: '从小帮家里干农活。懂得种植、识别野菜和基础工具修理。',
    attributeBonus: { insight: 1, composure: 1, tenacity: 3, charisma: 0, cunning: 1 },
    startingSkills: ['生存·野外识别', '生存·种植', '工艺·基础修理'],
    startingGoldBonus: 0,
  },
  {
    id: 'delinquent', name: '不良少年', desc: '在学校是让老师头疼的人物。但街头智慧在异世界意外地有用。',
    attributeBonus: { insight: 2, composure: 3, tenacity: 2, charisma: -1, cunning: 1 },
    startingSkills: ['战斗·街头格斗', '社交·威胁', '策略·危机直觉'],
    startingGoldBonus: 10,
  },
  {
    id: 'bookworm', name: '图书馆管理员', desc: '三年图书馆义工。读过比任何人都多的书——包括大量的历史、地理和生存指南。',
    attributeBonus: { insight: 4, composure: 1, tenacity: 0, charisma: 0, cunning: 2 },
    startingSkills: ['知识·异世界历史推测', '知识·地理识别', '知识·文字破译'],
    startingGoldBonus: 0,
  },
  {
    id: 'chef', name: '烹饪社社长', desc: '能在一小时内用有限食材做出能吃的东西——末日中这可能是最实用的技能。',
    attributeBonus: { insight: 2, composure: 1, tenacity: 1, charisma: 1, cunning: 1 },
    startingSkills: ['生存·烹饪', '生存·食材鉴别', '知识·营养学'],
    startingGoldBonus: 5,
  },
  {
    id: 'artist', name: '美术特长生', desc: '善于观察细节和空间布局。画地图和识别伪造文件的能力在异世界出奇地有用。',
    attributeBonus: { insight: 3, composure: 1, tenacity: 0, charisma: 1, cunning: 2 },
    startingSkills: ['知识·地图绘制', '知识·文件鉴定', '工艺·临摹'],
    startingGoldBonus: 0,
  },
  {
    id: 'orphan', name: '福利院长大的孩子', desc: '没有家人，没有退路。习惯了在资源有限的环境中保护自己。',
    attributeBonus: { insight: 2, composure: 3, tenacity: 3, charisma: 0, cunning: 1 },
    startingSkills: ['生存·耐饿', '生存·物资管理', '社交·察言观色'],
    startingGoldBonus: -20,
  },
];

const SYSTEM_PROMPT = `你是异世界生存游戏《灰丘领主》的叙事AI助手。游戏设定：
- 主角是普通高中生，被召唤到异世界圣光王国
- 主角无超自然能力，靠头脑和资源生存
- 世界处于末日危机中：红月现象、魔潮、预言中的灾难
- 存在神殿、勇者、亚人、奴隶制等复杂势力

叙事要求：
- 冷峻写实，避免日式轻小说风格
- 注重细节和因果链
- 从主角第一人称视角
- 显示资源紧张和生存压力
- 150-400字为宜`;
