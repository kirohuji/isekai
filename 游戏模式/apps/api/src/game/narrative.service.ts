import { Injectable } from '@nestjs/common';
import type { WorldState, Intent, TurnResolution, GameEvent, CharacterState, NarrativeHint } from '@gray-hill/engine';
import { PHASE_LABELS, DIFFICULTY_CONFIG, POPULATION_SCALES } from '@gray-hill/engine';

/**
 * 叙事服务
 * 
 * 职责：
 * 1. 根据TurnResolution生成叙事文本
 * 2. 在无AI可用时提供模板叙事
 * 3. 管理叙事风格与语气
 * 
 * 未来可接入OpenAI/Claude等LLM生成更丰富的叙事
 */
@Injectable()
export class NarrativeService {
  /**
   * 生成回合叙事（模板驱动，可替换为AI）
   */
  generateNarrative(
    state: WorldState,
    intent: Intent,
    resolution: TurnResolution,
  ): { body: string; mood: string; facts: string[] } {
    const player = state.characters.find(c => c.id === state.playerId)!;
    const location = state.locations.find(l => l.id === player.locationId);
    const phaseLabel = PHASE_LABELS[state.phase];
    const diffLabel = DIFFICULTY_CONFIG[state.difficulty].label;
    const popLabel = POPULATION_SCALES[state.populationScale].description;

    const segments: string[] = [];
    const facts: string[] = [];

    // 开场：时间地点
    segments.push(`第${state.round}回合 · 第${state.day}天 · ${phaseLabel}`);
    segments.push(`${location?.name ?? '未知地点'}，${location?.region ?? ''}。光线下是${state.phase === 'night' ? '火把摇曳的影子' : state.phase === 'dawn' ? '刚升起的薄雾' : '来来往往的人'}.`);

    // 玩家行动结果
    segments.push(this.describeActionResult(intent, player, location, resolution));
    facts.push(`玩家${player.name}执行了${intent.label ?? intent.kind}`);

    // 关键事件
    const significantEvents = resolution.playerEvents.filter(
      e => e.category === 'public' || e.actorId === state.playerId || e.type.includes('died')
    );
    
    if (significantEvents.length > 0) {
      segments.push('');
      for (const evt of significantEvents.slice(0, 5)) {
        segments.push(`▸ ${evt.description}`);
        facts.push(evt.description);
      }
    }

    // 死亡
    if (resolution.deaths.length > 0) {
      segments.push('');
      segments.push('---');
      for (const death of resolution.deaths.slice(0, 3)) {
        segments.push(`⚰ ${death.name} 在${location?.name ?? '某处'} ${death.reason}。`);
      }
      if (resolution.deaths.length > 3) {
        segments.push(`...以及另外 ${resolution.deaths.length - 3} 人。`);
      }
    }

    // 世界态势
    segments.push('');
    segments.push(this.describeWorldState(state, resolution));

    // 可选行动提示
    segments.push('');
    segments.push(`[你可以：移动 | 休息 | 探索 | 工作 | 交易 | 狩猎 | 社交 | 建造 | 等待]`);

    const body = segments.join('\n\n');
    const mood = resolution.deaths.length > 0 ? 'grim' : 
                 significantEvents.some(e => e.type.includes('discovery')) ? 'hopeful' : 
                 'survival';

    return { body, mood, facts };
  }

  /**
   * 生成可用行动列表
   */
  generateActions(state: WorldState): Array<{
    kind: string;
    targetId?: string;
    label: string;
    cost: string;
    category: string;
  }> {
    const player = state.characters.find(c => c.id === state.playerId)!;
    const location = state.locations.find(l => l.id === player.locationId);
    const actions: Array<{ kind: string; targetId?: string; label: string; cost: string; category: string }> = [];

    // 移动（到相邻地点）
    if (location) {
      for (const connId of location.connectedLocations) {
        const conn = state.locations.find(l => l.id === connId);
        if (conn) {
          actions.push({
            kind: 'move',
            targetId: conn.id,
            label: `前往${conn.name}`,
            cost: `${conn.travelCost}回合 · 体力-8`,
            category: '移动',
          });
        }
      }
    }

    // 基础行动
    actions.push(
      { kind: 'rest', label: '原地休整', cost: '1回合 · 恢复体力/生命/精神', category: '生存' },
      { kind: 'explore', label: '探索周围', cost: '1回合 · 体力-10 · 可能发现物品', category: '探索' },
      { kind: 'work', label: '寻找短工', cost: '1回合 · 体力-12 · 赚取金币', category: '经济' },
      { kind: 'socialize', label: '与附近的人交谈', cost: '1回合 · 体力-5', category: '社交' },
      { kind: 'hunt', label: '狩猎觅食', cost: '1回合 · 体力-14 · 概率获得粮食', category: '生存' },
      { kind: 'gather', label: '采集资源', cost: '1回合 · 体力-8', category: '生存' },
      { kind: 'trade', label: '交易物品', cost: '1回合 · 体力-6', category: '经济' },
      { kind: 'scout', label: '侦察周边威胁', cost: '1回合 · 体力-8', category: '探索' },
      { kind: 'build', label: '建设/修缮', cost: '2回合 · 体力-16', category: '建设' },
      { kind: 'wait', label: '等待并观察', cost: '1回合 · 体力-3', category: '其他' },
    );

    return actions;
  }

  // ============================================================
  // 叙事生成辅助
  // ============================================================

  private describeActionResult(
    intent: Intent,
    player: CharacterState,
    location: { name: string; region: string } | undefined,
    resolution: TurnResolution,
  ): string {
    const place = location?.name ?? '未知地点';
    
    switch (intent.kind) {
      case 'move': {
        const target = resolution.state.locations.find(l => l.id === intent.targetId);
        return `你离开了${place}，前往${target?.name ?? '新地点'}。两边的世界都没有停下——每个人都在同一时刻做着自己的选择。`;
      }
      case 'rest':
        return `你在${place}找了个角落坐下来。呼吸慢慢平稳下来，体力在恢复。`;
      case 'explore':
        return `你在${place}周边仔细搜寻。${resolution.playerEvents.some(e => e.type === 'explore.discovery') ? '运气不错，你找到了一些有用的东西。' : '没有特别的发现，但你更熟悉这片区域了。'}`;
      case 'work': {
        const workEvent = resolution.playerEvents.find(e => e.type === 'action.work');
        const earned = workEvent?.payload?.earned ?? 0;
        return `你帮了${place}的人几个小时的忙。口袋里多了${earned}枚金币。`;
      }
      case 'hunt': {
        const huntEvent = resolution.playerEvents.find(e => e.type === 'action.hunt_success');
        return huntEvent ? `你的狩猎成功了。晚餐有了着落。` : `你在野外搜寻了很久，但今天猎物没有露面。`;
      }
      case 'socialize':
        return `你花了一些时间与${place}的人交谈。每一句话都可能是一颗种子。`;
      case 'build':
        return `你卷起袖子开始干活。建造是慢功夫，但每一块石头都算数。`;
      case 'trade':
        return `你在${place}的市场转了一圈，做了几笔买卖。`;
      case 'scout':
        return `你小心翼翼地侦察${place}的周边。情报有时候比粮食还值钱。`;
      case 'gather':
        return `你在野外收集了一些可用的物资。`;
      case 'wait':
        return `你待在原地，观察着${place}的节奏。等待也是一种策略。`;
      default:
        return `你在${place}度过了这段时间。`;
    }
  }

  private describeWorldState(state: WorldState, resolution: TurnResolution): string {
    const player = state.characters.find(c => c.id === state.playerId)!;
    const aliveCore = state.characters.filter(c => c.alive && c.isCore).length;
    const totalCore = state.characters.filter(c => c.isCore).length;
    const totalDeaths = resolution.deaths.length;
    
    return [
      `👤 ${player.name} | ❤️${player.health}/${player.maxHealth} ⚡${player.stamina}/${player.maxStamina} 🧠${player.mental}/${player.maxMental} 🍖${player.hunger}/100`,
      `💰 ${player.gold}金币 | 🌍 难度: ${DIFFICULTY_CONFIG[state.difficulty].label} | 人口规模: ${POPULATION_SCALES[state.populationScale].description}`,
      `📊 核心角色: ${aliveCore}/${totalCore} 存活 | 本回合死亡: ${totalDeaths}人`,
    ].join('\n');
  }
}
