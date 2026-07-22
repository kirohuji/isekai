import { DatabaseSync } from 'node:sqlite';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DB_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DB_DIR, 'gray-hill.db');

// ---- 表接口 ----
export interface GameRow { id: string; created_at: string; updated_at: string; player_name: string; difficulty: string; population_scale: string; state_json: string; is_active: number; }
export interface EventRow { id: number; game_id: string; round: number; day: number; phase: string; event_id: string; event_type: string; category: string; actor_id: string | null; target_id: string | null; location_id: string | null; title: string; description: string; payload_json: string; caused_by_json: string; created_at: string; }
export interface NarrativeRow { id: number; game_id: string; round: number; day: number; phase: string; viewpoint_actor_id: string; body: string; mood: string | null; facts_json: string; related_characters_json: string; created_at: string; }
export interface NpcRow { id: number; name: string; race: string; gender: string; faction: string; role: string; description: string; location_id: string; combat: number; is_alive: number; is_core: number; }
export interface LocationRow { id: number; location_key: string; name: string; region: string; description: string; is_safe: number; travel_cost: number; population: number; faction_control: string; connected_json: string; }
export interface ItemRow { id: number; name: string; item_type: string; description: string; base_price: number; rarity: string; effects_json: string; }
export interface EventTemplateRow { id: number; name: string; category: string; trigger_condition_json: string; narrative_template: string; choices_json: string; cooldown_rounds: number; priority: number; }

@Injectable()
export class DatabaseService implements OnModuleInit {
  readonly db: DatabaseSync;

  constructor() {
    mkdirSync(DB_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  }

  onModuleInit() {
    this.migrate();
    this.seedIfEmpty();
  }

  // ============================================================
  // 迁移
  // ============================================================
  private migrate() {
    this.db.exec(`
      -- 游戏存档
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        player_name TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        population_scale TEXT NOT NULL,
        state_json TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      -- 回合事件
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL, round INTEGER NOT NULL, day INTEGER NOT NULL, phase TEXT NOT NULL,
        event_id TEXT NOT NULL, event_type TEXT NOT NULL, category TEXT NOT NULL,
        actor_id TEXT, target_id TEXT, location_id TEXT,
        title TEXT NOT NULL, description TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}', caused_by_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ev_game_round ON events(game_id, round);

      -- 叙事记录
      CREATE TABLE IF NOT EXISTS narratives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL, round INTEGER NOT NULL, day INTEGER NOT NULL, phase TEXT NOT NULL,
        viewpoint_actor_id TEXT NOT NULL DEFAULT 'player',
        body TEXT NOT NULL, mood TEXT,
        facts_json TEXT NOT NULL DEFAULT '[]', related_characters_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_nar_game_round ON narratives(game_id, round);

      -- 行动日志
      CREATE TABLE IF NOT EXISTS action_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL, round INTEGER NOT NULL,
        actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
        intent_json TEXT NOT NULL, result_summary TEXT,
        is_ai_suggested INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_al_game ON action_log(game_id, round);

      -- 死亡记录
      CREATE TABLE IF NOT EXISTS death_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL, round INTEGER NOT NULL,
        character_id TEXT NOT NULL, character_name TEXT NOT NULL,
        reason TEXT NOT NULL, location_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );

      -- 快照
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL, round INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );

      -- ======== 静态数据表（种子填充后不变） ========

      -- NPC模板
      CREATE TABLE IF NOT EXISTS npc_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        race TEXT NOT NULL DEFAULT '人类',
        gender TEXT NOT NULL DEFAULT '男',
        faction TEXT,
        role TEXT,
        description TEXT,
        default_location_key TEXT,
        base_combat INTEGER DEFAULT 1,
        base_defense INTEGER DEFAULT 1,
        base_agility INTEGER DEFAULT 5,
        is_core INTEGER DEFAULT 1
      );

      -- 地点模板
      CREATE TABLE IF NOT EXISTS location_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        region TEXT NOT NULL,
        description TEXT,
        is_safe INTEGER DEFAULT 1,
        travel_cost INTEGER DEFAULT 1,
        population INTEGER DEFAULT 100,
        faction_control TEXT,
        connected_json TEXT NOT NULL DEFAULT '[]'
      );

      -- 物品模板
      CREATE TABLE IF NOT EXISTS item_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        item_type TEXT NOT NULL DEFAULT 'misc',
        description TEXT,
        base_price INTEGER DEFAULT 0,
        rarity TEXT DEFAULT 'common',
        effects_json TEXT NOT NULL DEFAULT '{}'
      );

      -- 事件模板
      CREATE TABLE IF NOT EXISTS event_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        trigger_condition_json TEXT NOT NULL DEFAULT '{}',
        narrative_template TEXT NOT NULL,
        choices_json TEXT NOT NULL DEFAULT '[]',
        cooldown_rounds INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 5
      );

      -- 势力定义
      CREATE TABLE IF NOT EXISTS faction_defs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        faction_type TEXT NOT NULL,
        description TEXT,
        home_region TEXT
      );

      -- 世界标记（跨存档的全局标记，用于事件解锁等）
      CREATE TABLE IF NOT EXISTS game_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        flag_name TEXT NOT NULL,
        flag_value TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id),
        UNIQUE(game_id, flag_name)
      );
      CREATE INDEX IF NOT EXISTS idx_gf_game ON game_flags(game_id);

      -- 玩家资产/契约
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        asset_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        asset_type TEXT NOT NULL DEFAULT 'property',
        description TEXT,
        value INTEGER DEFAULT 0,
        daily_income INTEGER DEFAULT 0,
        daily_upkeep INTEGER DEFAULT 0,
        location_id TEXT,
        acquired_round INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_assets_game ON assets(game_id);

      -- 雇佣关系
      CREATE TABLE IF NOT EXISTS employments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        employer_id TEXT NOT NULL DEFAULT 'player',
        role TEXT DEFAULT '员工',
        salary INTEGER DEFAULT 5,
        hired_round INTEGER DEFAULT 0,
        loyalty INTEGER DEFAULT 50,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (game_id) REFERENCES games(id),
        UNIQUE(game_id, employee_id)
      );
      CREATE INDEX IF NOT EXISTS idx_emp_game ON employments(game_id);

      -- 队伍成员
      CREATE TABLE IF NOT EXISTS party_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        role TEXT DEFAULT '成员',
        joined_round INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (game_id) REFERENCES games(id),
        UNIQUE(game_id, character_id)
      );
      CREATE INDEX IF NOT EXISTS idx_party_game ON party_members(game_id);

      -- 关系网络
      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        char_a TEXT NOT NULL,
        char_b TEXT NOT NULL,
        affection INTEGER DEFAULT 0,
        trust INTEGER DEFAULT 0,
        status TEXT DEFAULT '陌生人',
        last_interaction_round INTEGER DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games(id),
        UNIQUE(game_id, char_a, char_b)
      );
      CREATE INDEX IF NOT EXISTS idx_rel_game ON relationships(game_id);

      -- 奴隶
      CREATE TABLE IF NOT EXISTS slaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        owner_id TEXT NOT NULL DEFAULT 'player',
        slave_type TEXT NOT NULL DEFAULT 'labor',
        obedience INTEGER DEFAULT 30,
        fear INTEGER DEFAULT 50,
        breaking_progress INTEGER DEFAULT 0,
        escape_attempts INTEGER DEFAULT 0,
        last_night_interact_round INTEGER DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games(id),
        UNIQUE(game_id, character_id)
      );

      -- 情报库
      CREATE TABLE IF NOT EXISTS intel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        intel_id TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'rumor',
        source TEXT DEFAULT 'observation',
        truth_probability INTEGER DEFAULT 50,
        acquired_round INTEGER DEFAULT 0,
        expiry_day INTEGER DEFAULT 9999,
        is_verified INTEGER DEFAULT 0,
        related_character_id TEXT,
        related_location_id TEXT,
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_intel_game ON intel(game_id);

      -- 行动模板（动态行动的基础）
      CREATE TABLE IF NOT EXISTS action_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        detail TEXT,
        category TEXT NOT NULL DEFAULT '其他',
        cost_phases INTEGER DEFAULT 1,
        cost_stamina INTEGER DEFAULT 8,
        cost_hunger INTEGER DEFAULT 2,
        conditions_json TEXT NOT NULL DEFAULT '{}',
        priority INTEGER DEFAULT 5
      );

      -- 规则/效果表（AI 生成，存储活跃规则）
      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        rule_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'ai_generated',
        conditions_json TEXT NOT NULL DEFAULT '[]',
        effects_json TEXT NOT NULL DEFAULT '[]',
        duration INTEGER DEFAULT 0,
        source TEXT,
        causal_parent TEXT,
        priority INTEGER DEFAULT 5,
        active_since INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_rules_game ON rules(game_id);

      -- 背包/物品
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'misc',
        quantity INTEGER DEFAULT 1,
        description TEXT,
        value INTEGER DEFAULT 0,
        effects_json TEXT DEFAULT '{}',
        is_equipped INTEGER DEFAULT 0,
        equipped_slot TEXT,
        FOREIGN KEY (game_id) REFERENCES games(id),
        UNIQUE(game_id, item_id)
      );

      -- 任务
      CREATE TABLE IF NOT EXISTS quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        quest_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'side',
        status TEXT DEFAULT 'active',
        objectives_json TEXT NOT NULL DEFAULT '[]',
        rewards_json TEXT NOT NULL DEFAULT '{}',
        giver_id TEXT,
        deadline_day INTEGER,
        acquired_round INTEGER DEFAULT 0,
        completed_round INTEGER,
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_quests_game ON quests(game_id);
    `);
  }

  // ============================================================
  // 种子数据
  // ============================================================
  private seedIfEmpty() {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM location_templates').get() as { c: number }).c;
    if (count > 0) return;

    console.log('🌱 正在播种初始世界数据...');
    this.seedLocations();
    this.seedNpcs();
    this.seedItems();
    this.seedFactions();
    this.seedEventTemplates();
    this.seedActionTemplates();
    console.log('✅ 种子数据写入完成');
  }

  private seedLocations() {
    const stmt = this.db.prepare(
      `INSERT INTO location_templates(location_key, name, region, description, is_safe, travel_cost, population, faction_control, connected_json) VALUES(?,?,?,?,?,?,?,?,?)`
    );
    const data: [string, string, string, string, number, number, number, string, string][] = [
      ['summon_square', '召唤广场', '王都', '圆形大厅外的广场。石板地面上刻着褪色的符文。异世界召唤仪式的落点。', 1, 0, 3000, '王室', '["north_market","old_inn","temple_district"]'],
      ['north_market', '北门集市', '王都', '粮食、旧衣物、药草的交易场所。人多眼杂，谣言和情报在这里交换。', 1, 1, 8000, '商人公会', '["summon_square","gray_rope_market","city_gate"]'],
      ['old_inn', '旧鹿角旅馆', '王都平民区', '六间客房的小旅馆，前门对着一条半死不活的巷子。玛莎的炖菜味道不错。', 1, 1, 30, '灰丘阵营', '["summon_square","sewer_entrance"]'],
      ['temple_district', '神殿区', '王都', '灰袍守卫每隔三个路口设一个检查岗。空气中弥漫着焚香和恐惧。', 0, 1, 3000, '神殿', '["summon_square","city_gate","third_temple"]'],
      ['third_temple', '第三圣殿', '王都神殿区', '档案馆所在。沈清岚曾在此工作。堆满预言记录的羊皮纸。', 0, 0, 200, '神殿', '["temple_district"]'],
      ['gray_rope_market', '灰绳市场', '王都城外', '合法与非法奴隶交易中心。栅栏后面是笼子。亚人的哭声从早到晚。', 0, 2, 2000, '盗贼同盟', '["north_market","sewer_entrance","marsh_edge"]'],
      ['sewer_entrance', '排水道入口', '王都地下', '连接旅馆地窖和城外的地下通道。黑暗、潮湿、部分坍塌。逃亡者的密道。', 0, 1, 100, '灰丘阵营', '["old_inn","marsh_edge","gray_rope_market"]'],
      ['city_gate', '王都城门', '王都', '巨大的铁箍木门。守卫检查每一个出城的人——主要是查奴隶。', 1, 1, 500, '王室', '["north_market","temple_district","road_south"]'],
      ['road_south', '南方大道', '王都外围', '连接王都与东南边境的主路。路边有废弃的哨站和商队营地。', 0, 2, 1000, '王室', '["city_gate","marsh_edge","twilight_town"]'],
      ['marsh_edge', '东南沼泽·边缘', '东南边境', '王都外的危险缓冲区。腐齿鼠、沼鳄、拾荒者出没。亚人聚落入口隐藏其中。', 0, 2, 300, '无', '["sewer_entrance","road_south","twilight_town"]'],
      ['twilight_town', '暮河镇', '东南边境', '边境小镇。药草、木材、渡船。权力网络腐败，周启明在此有眼线。', 1, 3, 3000, '暮河镇权力网', '["road_south","marsh_edge","reed_village","monastery_outer"]'],
      ['reed_village', '苇水村', '东南边境', '人类与亚人共存的小村庄。村长奥森。洪水后粮食仅余十余天。', 1, 1, 500, '苇水村', '["twilight_town","gray_hill"]'],
      ['monastery_outer', '暮河镇外围修道院', '东南边境', '许安然的避难所。周边可能有周启明的人监视。', 1, 1, 50, '神殿', '["twilight_town"]'],
      ['gray_hill', '灰丘', '东南边境', '苇水村南侧约两里的废弃高地。石基木屋+坍塌储藏坑。你的新据点。', 1, 0, 5, '灰丘阵营', '["reed_village","marsh_edge"]'],
      ['deep_marsh', '东南沼泽·深处', '东南边境', '魔化生物更多。亚人聚落隐藏在深处。很少有人活着回来。', 0, 3, 100, '亚人网络', '["marsh_edge"]'],
      ['iron_spine_mine', '铁脊矿区', '西部', '王国最大矿区。数千奴隶在此劳作。陈浩在此镇压。', 0, 4, 5000, '铁脊伯爵家族', '[]'],
      ['sigh_wall', '叹息之墙', '北方边境', '古代防御工事。守备严重不足。', 0, 5, 200, '王室', '[]'],
      ['great_cathedral', '大圣堂', '王都神殿区', '第一圣殿。大神官驻地。王都最宏伟的建筑。', 0, 0, 500, '神殿', '["temple_district"]'],
      ['north_plains', '北部平原', '北部', '广阔农田与牧场。王国主要粮食产区。近来频繁遭受魔物袭击。', 0, 2, 20000, '王室', '["sigh_wall"]'],
    ];
    for (const d of data) stmt.run(...d);
  }

  private seedNpcs() {
    const stmt = this.db.prepare(
      `INSERT INTO npc_templates(name, race, gender, faction, role, description, default_location_key, base_combat, base_defense, base_agility, is_core) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    );
    const data: [string, string, string, string, string, string, string, number, number, number, number][] = [
      ['沈清岚', '人类', '女', '灰丘阵营', '女主/军师', '短发女同学。极强记忆力，掌握50人名单。已告白。', 'gray_hill', 1, 2, 6, 1],
      ['格兰', '亚人(狼系)', '男', '亚人网络', '猎人向导', '狼系亚人猎人。性格务实谨慎，不轻信人类。短弓。妻子被抓走。', 'gray_hill', 6, 3, 7, 1],
      ['米娅', '亚人(狼系)', '女', '灰丘阵营', '伙伴', '格兰之女，灰色兽耳。药草识别、敏锐嗅觉。右腿曾受伤。', 'gray_hill', 2, 1, 8, 1],
      ['周启明', '人类', '男', '勇者集团', '对手/勇者', '核心勇者，光系神力。表面帮助他人，实际纵容霸凌。对沈清岚有占有欲。', 'twilight_town', 9, 5, 7, 1],
      ['陈浩', '人类', '男', '勇者集团', '反派/高级能力者', '火系高级能力者。替贵族镇压矿区逃奴，焚烧逃亡者棚屋。', 'iron_spine_mine', 8, 4, 6, 1],
      ['梁峰', '人类', '男', '王国军队', '反派/高级能力者', '高级能力者。加入王国军队，主动惩戒不服从的召唤者。', 'city_gate', 8, 5, 6, 1],
      ['孙茂', '人类', '男', '神殿', '反派/高级能力者', '依附神殿女祭司，替她寻找年轻漂亮的异界女性。', 'temple_district', 7, 3, 6, 1],
      ['许安然', '人类', '女', '神殿', '预言者', '女同学，被分配至第七神殿负责预言记录。当前失明。', 'monastery_outer', 0, 0, 3, 1],
      ['玛莎', '人类', '女', '旧鹿角旅馆', '员工', '旅馆厨娘，寡妇。嘴硬善良。把卖剩面包送给孩子。', 'old_inn', 1, 1, 4, 0],
      ['莱恩', '人类', '男', '旧鹿角旅馆', '员工', '旅馆清洁工兼记账员。胆小但本质不坏。', 'old_inn', 1, 1, 4, 0],
      ['哈罗德', '人类', '男', '旧鹿角旅馆', '员工', '独眼退伍老兵，夜间守卫。曾为商队杀人。', 'old_inn', 5, 3, 5, 0],
      ['罗德里克', '人类', '男', '暮河镇权力网', '反派/商人', '暮河镇最大药材商。举报亚人聚落导致格兰妻子被抓。囤积粮食药品。', 'twilight_town', 2, 2, 4, 1],
      ['奥森', '人类', '男', '苇水村', '村长', '苇水村村长，六十多岁，左手缺两根手指。善良清醒。', 'reed_village', 2, 1, 3, 1],
      ['蕾娜', '亚人(猫系)', '女', '亚人网络', '斥候/猎人', '黑色猫耳，脸颊有自己缝的旧刀疤。左手缺半个小指。独立斥候兼猎人。', 'deep_marsh', 5, 2, 9, 1],
      ['伊丝琳', '精灵', '女', '精灵流亡者', '草药师', '银白发编成单辫，自己割短了尖耳。独自在边境藏了十年。', 'marsh_edge', 4, 1, 7, 1],
      ['沃尔克', '人类', '男', '奴隶贩运网络', '奴隶贩子', '曾控制逃亡中的沈清岚并将其送入灰绳市场。', 'gray_rope_market', 3, 2, 4, 0],
      ['亚人老祭司', '亚人(狐系)', '男', '亚人网络', '长老', '懂得魔化、腐兽、魔潮和亚人古老记录。', 'deep_marsh', 1, 1, 3, 1],
      ['大神官', '人类', '未知', '神殿', '最高领袖', '神殿最高权威。身份、姓名、性别均未知。掌握神殿最深层的秘密。', 'great_cathedral', 3, 3, 3, 0],
      ['某女祭司', '人类', '女', '神殿', '祭司', '孙茂的依附对象。以追加祝福换取孙茂替她寻找年轻漂亮的异界女性。', 'temple_district', 2, 2, 4, 0],
      ['第七圣殿祭司', '人类', '未知', '第七圣殿', '祭司', '许安然的上司，负责预言记录和解读。', 'third_temple', 2, 2, 4, 0],
    ];
    for (const d of data) stmt.run(...d);
  }

  private seedItems() {
    const stmt = this.db.prepare(
      `INSERT INTO item_templates(name, item_type, description, base_price, rarity, effects_json) VALUES(?,?,?,?,?,?)`
    );
    const data: [string, string, string, number, string, string][] = [
      ['黑面包（日份）', 'food', '粗糙但能充饥的黑面包。一天的量。', 3, 'common', '{"hunger_reduce":10}'],
      ['干肉（日份）', 'food', '盐腌的干肉，保存时间长。', 8, 'common', '{"hunger_reduce":15,"stamina_bonus":5}'],
      ['药草包', 'medicine', '基础外伤处理用的药草。', 15, 'common', '{"health_restore":15}'],
      ['退烧药', 'medicine', '对付高烧和感染的药剂。', 25, 'uncommon', '{"health_restore":10,"cure_sick":true}'],
      ['魔化抑制剂', 'medicine', '抑制魔化进程的珍贵药物。神殿管控物资。', 80, 'rare', '{"cure_corruption":20}'],
      ['银叶草', 'herb', '亚人聚落特产的珍贵草药。可用于制作高级药品。', 40, 'uncommon', '{"health_restore":25,"mental_restore":10}'],
      ['盐', 'trade_good', '重要调味品和保存剂。边境贸易硬通货。', 10, 'common', '{}'],
      ['铁匕首', 'weapon', '短小精悍的近身武器。', 30, 'common', '{"combat_bonus":2}'],
      ['短弓', 'weapon', '猎人的标准装备。需要一定技巧。', 40, 'common', '{"combat_bonus":3,"ranged":true}'],
      ['皮甲', 'armor', '轻便的基础护甲。', 25, 'common', '{"defense_bonus":2}'],
      ['铁剑', 'weapon', '标准的单手剑。需要一定力量。', 50, 'uncommon', '{"combat_bonus":4}'],
      ['木盾', 'armor', '简易的木制盾牌。', 20, 'common', '{"defense_bonus":3}'],
      ['绳索（30尺）', 'tool', '麻制绳索。探险、建筑、逃亡必备。', 8, 'common', '{}'],
      ['火石与火镰', 'tool', '野外生火的基本工具。', 5, 'common', '{}'],
      ['背包', 'tool', '增加携带容量的皮背包。', 12, 'common', '{}'],
      ['旧日记本', 'lore', '一本字迹模糊的旧日记。可能藏着线索。', 5, 'common', '{}'],
      ['神殿通行证（伪造）', 'document', '伪造的神殿人员通行证。风险极高。', 100, 'rare', '{}'],
      ['魔物牙齿', 'material', '低级魔物的牙齿。可用于制作武器或出售。', 6, 'common', '{}'],
      ['沼鳄皮', 'material', '沼泽鳄鱼的皮。适合做护甲。', 20, 'uncommon', '{}'],
      ['铜币', 'currency', '100铜=1银。', 0, 'common', '{}'],
    ];
    for (const d of data) stmt.run(...d);
  }

  private seedFactions() {
    const stmt = this.db.prepare(`INSERT INTO faction_defs(name, faction_type, description, home_region) VALUES(?,?,?,?)`);
    const data: [string, string, string, string][] = [
      ['王室', 'government', '王国名义最高权力，实际受神殿制约。', '王都'],
      ['神殿', 'religious', '七大圣殿体系。掌握召唤、预言、身份登记、奴隶契约。', '王都及全境'],
      ['勇者集团', 'military_elite', '七名核心勇者。非统一阵营，各怀利益。', '全境'],
      ['商人公会', 'guild', '王国最强大民间组织。贸易许可、价格协定、债务追讨。', '王都及主要城镇'],
      ['工匠公会', 'guild', '铁匠、木匠、石匠、皮匠、药剂师等行会。师徒制。', '各城镇'],
      ['猎人协会', 'semi_legal_guild', '灰色地带半合法组织。大量亚人成员。', '东南沼泽、北方边境'],
      ['暮河镇权力网', 'local_power', '边境伯爵+守卫+税务官+商人+神殿。腐败垄断。', '暮河镇'],
      ['苇水村', 'settlement', '人类与亚人共存的河边村庄。务实友善。村长奥森。', '暮河镇与沼泽之间'],
      ['亚人网络', 'loose_alliance', '多亚种松散互助体系。情报共享和贸易为主。', '边境、沼泽、森林'],
      ['铁脊伯爵家族', 'noble_house', '西方矿区统治贵族。残酷镇压维持秩序。', '西方矿区'],
      ['灰丘阵营', 'independent', '男主的独立阵营。以灰丘为据点。', '灰丘'],
      ['精灵流亡者', 'refugee', '精灵灭绝战争中幸存者的后裔。伊丝琳为代表。', '边境各地'],
      ['奴隶贩运网络', 'underground', '合法与非法奴隶交易的运作网络。', '王都及边境'],
      ['旧鹿角旅馆', 'establishment', '王都平民区的小旅馆。男主的第一个据点。', '王都'],
    ];
    for (const d of data) stmt.run(...d);
  }

  private seedEventTemplates() {
    const stmt = this.db.prepare(
      `INSERT INTO event_templates(name, category, trigger_condition_json, narrative_template, choices_json, cooldown_rounds, priority) VALUES(?,?,?,?,?,?,?)`
    );
    const data: [string, string, string, string, string, number, number][] = [
      ['路边发现', 'exploration', '{"location_type":"outdoor","random_chance":0.25}', '你在{location}附近走着，脚下的泥地被什么东西硌了一下。', '[{"text":"挖开看看","outcome":"discovery","risk":"low"},{"text":"不管它","outcome":"nothing"}]', 0, 3],
      ['废弃建筑线索', 'exploration', '{"location_type":"border","random_chance":0.18}', '路边有一栋{abandoned_building}。门板已经掉了，里面黑洞洞的。', '[{"text":"进去探索","outcome":"discovery","risk":"medium"},{"text":"继续赶路","outcome":"nothing"},{"text":"做标记，改天带人来","outcome":"remember_location"}]', 0, 4],
      ['异常痕迹', 'exploration', '{"location_type":"wild","min_insight":2}', '地面上的{track_type}引起了你的注意。{track_detail}', '[{"text":"顺着痕迹追查","outcome":"track_event","risk":"high"},{"text":"记录位置后离开","outcome":"intel"}]', 3, 5],
      ['可疑的陌生人', 'social', '{"location_type":"town|city","random_chance":0.22}', '{npc_desc}走到了你面前。{npc_action}', '[{"text":"保持距离，观察对方","outcome":"observe"},{"text":"上前搭话","outcome":"talk_npc"},{"text":"绕道而行","outcome":"nothing"}]', 2, 4],
      ['求助者', 'social', '{"min_reputation":5,"random_chance":0.2}', '一个{requester_desc}突然跪在你面前。"{plea_text}"', '[{"text":"提供帮助","outcome":"help_event","cost":"variable"},{"text":"拒绝","outcome":"reputation_loss"},{"text":"先问清楚","outcome":"intel"}]', 5, 5],
      ['物价波动', 'economy', '{"location_type":"market","min_days_since_last":3}', '你注意到{market}的{goods}价格比昨天{price_change}了。', '[{"text":"趁机买入","outcome":"buy_cheap"},{"text":"趁机卖出","outcome":"sell_high"},{"text":"观望","outcome":"nothing"}]', 3, 3],
      ['魔物遭遇', 'combat', '{"location_type":"wild","random_chance":0.15}', '前方的{terrain}传来{monster_sound}。{monster_desc}出现在你面前。', '[{"text":"战斗","outcome":"combat"},{"text":"尝试逃跑","outcome":"escape","risk":"medium"},{"text":"躲藏观察","outcome":"hide"}]', 1, 6],
      ['魔潮前兆', 'world', '{"red_moon_days_left_lte":30,"random_chance":0.3}', '天空又红了一点。空气中有微弱的烧灼味。动物比人先感觉到——{animal_behavior}', '[{"text":"记录观察","outcome":"intel"},{"text":"通知周围的人","outcome":"warn_others"},{"text":"抓紧准备物资","outcome":"prepare"}]', 7, 8],
      ['神殿巡逻队', 'world', '{"location_type":"town|city","random_chance":0.12}', '一群灰袍守卫正在{patrol_action}。你看到他们{brutal_detail}。', '[{"text":"绕开","outcome":"safe"},{"text":"混入人群观察","outcome":"intel"},{"text":"假装配合","outcome":"deception"}]', 4, 5],
      ['亚人商队', 'social', '{"location_type":"border","random_chance":0.15}', '一支由{caravan_type}带领的亚人商队正在路边休息。空气中飘着{exotic_smell}。', '[{"text":"上前打招呼","outcome":"talk_caravan"},{"text":"远远观察","outcome":"observe"},{"text":"无视","outcome":"nothing"}]', 3, 3],
      ['红月重合夜', 'world', '{"red_moon_days_left":0}', '天空正在变红。不是晚霞——是那轮月亮。{red_moon_desc}', '[{"text":"找掩体躲避","outcome":"shelter"},{"text":"在外面观察","outcome":"witness","risk":"extreme"},{"text":"回到室内祈祷","outcome":"pray"}]', 78, 10],
    ];
    for (const d of data) stmt.run(...d);
  }

  private seedActionTemplates() {
    const stmt = this.db.prepare(
      `INSERT INTO action_templates(kind, label, detail, category, cost_phases, cost_stamina, cost_hunger, conditions_json, priority) VALUES(?,?,?,?,?,?,?,?,?)`
    );
    const data: [string, string, string|null, string, number, number, number, string, number][] = [
      ['rest', '在旅馆休息', '找个房间好好睡一觉', '生存', 2, -30, 1, '{"locationHas":["bed"],"phase":["dawn","morning","noon","afternoon","dusk","night"]}', 1],
      ['sleep', '野外露宿', '找个隐蔽处凑合过夜', '生存', 1, -15, 3, '{"locationType":["wild","border"],"phase":["night","dusk"]}', 2],
      ['eat', '进食', '消耗粮食补充体力', '生存', 1, 5, -10, '{"requiresItem":"food","maxHunger":90,"emergencyAction":true}', 8],
      ['rest', '原地休整', '坐下喘口气', '生存', 1, -10, 2, '{"locationType":["any"]}', 3],
      ['heal', '包扎伤口', '使用药品治疗伤势', '生存', 1, 10, 2, '{"requiresItem":"medicine","minStats":{"health":70},"emergencyAction":true}', 8],
      ['explore', '探索周边', '仔细搜寻附近区域', '探索', 1, 12, 3, '{"locationType":["any"]}', 4],
      ['scout', '侦察威胁', '隐蔽地观察周围动向', '探索', 1, 8, 2, '{"locationType":["wild","border","town"]}', 4],
      ['hunt', '狩猎觅食', '在野外寻找猎物', '探索', 2, 16, 5, '{"locationType":["wild","border"],"phase":["dawn","morning","afternoon"]}', 4],
      ['gather', '采集资源', '收集可食用植物和材料', '探索', 1, 8, 2, '{"locationType":["wild","border","village"]}', 4],
      ['work', '寻找短工', '在附近找零活赚取金币', '经济', 1, 14, 4, '{"locationType":["town","city","market"]}', 4],
      ['trade', '交易物品', '在市场上买卖物资', '经济', 1, 6, 2, '{"locationType":["market","town","city"]}', 4],
      ['socialize', '与人交谈', '和附近的人聊聊天', '社交', 1, 5, 2, '{"locationType":["any"]}', 3],
      ['entertain', '酒馆消遣', '在酒馆喝酒放松', '社交', 2, 8, 3, '{"locationHas":["tavern"],"phase":["dusk","night"],"playerOnly":true}', 3],
      ['build', '建设修缮', '加固或扩建建筑物', '建设', 2, 18, 6, '{"locationType":["village","border","town"],"phase":["dawn","morning","noon","afternoon"]}', 4],
      ['patrol', '巡逻警戒', '在据点周围巡逻', '建设', 1, 10, 3, '{"locationHas":["shelter"]}', 3],
      ['train', '训练技能', '花时间练习提升能力', '建设', 2, 14, 4, '{"locationType":["any"]}', 3],
      ['night_interact', '夜间亲密', '与性奴隶过夜，恢复精神但可能上瘾', '特殊', 1, -5, 1, '{"requiresAsset":["sex_slave"],"phase":["night"],"playerOnly":true}', 6],
      ['pray', '祈祷', '在神殿中向女神祈祷', '特殊', 1, 3, 1, '{"locationHas":["temple"],"phase":["dawn","morning"]}', 3],
      ['wait', '等待观察', '待在原地观察情况', '其他', 1, 3, 2, '{"locationType":["any"]}', 10],
    ];
    for (const d of data) stmt.run(...d);
  }

  // ============================================================
  // 查询方法
  // ============================================================

  // -- 游戏 --
  saveGame(id: string, world: unknown, playerName: string, difficulty: string, popScale: string) {
    this.db.prepare(`INSERT INTO games(id, player_name, difficulty, population_scale, state_json, updated_at) VALUES(?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, updated_at=datetime('now')`).run(id, playerName, difficulty, popScale, JSON.stringify(world));
  }
  loadGame(id: string) {
    const row = this.db.prepare('SELECT * FROM games WHERE id=? AND is_active=1').get(id) as GameRow | undefined;
    if (!row) return null;
    return { state: JSON.parse(row.state_json), meta: { playerName: row.player_name, difficulty: row.difficulty, populationScale: row.population_scale } };
  }

  // -- 事件 --
  saveEvents(gameId: string, events: Array<{id:string;type:string;category:string;actorId?:string;targetId?:string;locationId?:string;round:number;phase:string;day:number;title:string;description:string;payload:Record<string,unknown>;causedBy:string[]}>) {
    const s = this.db.prepare(`INSERT INTO events(game_id,round,day,phase,event_id,event_type,category,actor_id,target_id,location_id,title,description,payload_json,caused_by_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const e of events) s.run(gameId, e.round, e.day, e.phase, e.id, e.type, e.category, e.actorId??null, e.targetId??null, e.locationId??null, e.title, e.description, JSON.stringify(e.payload), JSON.stringify(e.causedBy));
  }
  getRecentEvents(gameId: string, limit = 50) {
    return this.db.prepare('SELECT * FROM events WHERE game_id=? ORDER BY id DESC LIMIT ?').all(gameId, limit) as unknown as EventRow[];
  }

  // -- 叙事 --
  saveNarrative(gameId: string, round: number, day: number, phase: string, body: string, mood: string, facts: string[], relatedChars: string[]) {
    this.db.prepare(`INSERT INTO narratives(game_id,round,day,phase,body,mood,facts_json,related_characters_json) VALUES(?,?,?,?,?,?,?,?)`).run(gameId, round, day, phase, body, mood, JSON.stringify(facts), JSON.stringify(relatedChars));
  }
  getRecentNarrative(gameId: string) {
    return this.db.prepare('SELECT body,mood,round,day,phase FROM narratives WHERE game_id=? ORDER BY id DESC LIMIT 1').get(gameId) as { body:string; mood:string; round:number; day:number; phase:string } | undefined;
  }
  getNarratives(gameId: string, limit = 50) { return this.db.prepare('SELECT * FROM narratives WHERE game_id=? ORDER BY id DESC LIMIT ?').all(gameId, limit) as unknown as NarrativeRow[]; }

  // -- 行动日志 --
  saveAction(gameId: string, round: number, actorId: string, actorName: string, intent: unknown, summary: string, aiSuggested = false) {
    this.db.prepare(`INSERT INTO action_log(game_id,round,actor_id,actor_name,intent_json,result_summary,is_ai_suggested) VALUES(?,?,?,?,?,?,?)`).run(gameId, round, actorId, actorName, JSON.stringify(intent), summary, aiSuggested ? 1 : 0);
  }

  // -- 死亡 --
  saveDeaths(gameId: string, deaths: Array<{characterId:string;name:string;reason:string;locationId:string;round:number}>) {
    const s = this.db.prepare(`INSERT INTO death_log(game_id,round,character_id,character_name,reason,location_id) VALUES(?,?,?,?,?,?)`);
    for (const d of deaths) s.run(gameId, d.round, d.characterId, d.name, d.reason, d.locationId);
  }

  // -- 快照 --
  saveSnapshot(gameId: string, round: number, state: unknown) { this.db.prepare(`INSERT INTO snapshots(game_id,round,state_json) VALUES(?,?,?)`).run(gameId, round, JSON.stringify(state)); }

  // -- 标志 --
  setFlag(gameId: string, name: string, value: string) {
    this.db.prepare(`INSERT INTO game_flags(game_id,flag_name,flag_value) VALUES(?,?,?) ON CONFLICT(game_id,flag_name) DO UPDATE SET flag_value=excluded.flag_value`).run(gameId, name, value);
  }
  getFlag(gameId: string, name: string) { const r = this.db.prepare('SELECT flag_value FROM game_flags WHERE game_id=? AND flag_name=?').get(gameId, name) as {flag_value:string}|undefined; return r?.flag_value; }

  // -- 静态数据查询 --
  getAllLocations() { return this.db.prepare('SELECT * FROM location_templates').all() as unknown as LocationRow[]; }
  getLocationByKey(key: string) { return this.db.prepare('SELECT * FROM location_templates WHERE location_key=?').get(key) as LocationRow | undefined; }
  getAllNpcTemplates() { return this.db.prepare('SELECT * FROM npc_templates').all() as unknown as NpcRow[]; }
  getCoreNpcs() { return this.db.prepare('SELECT * FROM npc_templates WHERE is_core=1').all() as unknown as NpcRow[]; }
  getAllItems() { return this.db.prepare('SELECT * FROM item_templates').all() as unknown as ItemRow[]; }
  getItemsByType(type: string) { return this.db.prepare('SELECT * FROM item_templates WHERE item_type=?').all(type) as unknown as ItemRow[]; }
  getAllEventTemplates() { return this.db.prepare('SELECT * FROM event_templates').all() as unknown as EventTemplateRow[]; }
  getEventTemplatesByCategory(cat: string) { return this.db.prepare('SELECT * FROM event_templates WHERE category=?').all(cat) as unknown as EventTemplateRow[]; }
  getAllFactions() { return this.db.prepare('SELECT * FROM faction_defs').all() as Array<{id:number;name:string;faction_type:string;description:string;home_region:string}>; }

  getFullLog(gameId: string) {
    this.loadGame(gameId); // ensure exists
    return {
      events: this.getRecentEvents(gameId, 200),
      narratives: this.getNarratives(gameId, 100),
      deaths: this.db.prepare('SELECT * FROM death_log WHERE game_id=? ORDER BY id DESC LIMIT 50').all(gameId),
    };
  }
  // ---- 资产/契约 ----

  saveAsset(gameId: string, asset: { id: string; name: string; assetType: string; description: string; value: number; dailyIncome: number; dailyUpkeep: number; locationId: string; acquiredRound: number; isActive: boolean }) {
    this.db.prepare(`INSERT INTO assets(game_id, asset_id, name, asset_type, description, value, daily_income, daily_upkeep, location_id, acquired_round, is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET value=excluded.value, daily_income=excluded.daily_income, daily_upkeep=excluded.daily_upkeep, is_active=excluded.is_active`)
      .run(gameId, asset.id, asset.name, asset.assetType, asset.description, asset.value, asset.dailyIncome, asset.dailyUpkeep, asset.locationId, asset.acquiredRound, asset.isActive ? 1 : 0);
  }

  getAssets(gameId: string) {
    return this.db.prepare('SELECT * FROM assets WHERE game_id=? AND is_active=1').all(gameId) as unknown as Array<{
      asset_id: string; name: string; asset_type: string; description: string;
      value: number; daily_income: number; daily_upkeep: number; location_id: string;
      acquired_round: number; is_active: number;
    }>;
  }

  // ---- 雇佣 ----

  saveEmployment(gameId: string, emp: { employeeId: string; employeeName: string; employerId: string; role: string; salary: number; hiredRound: number; loyalty: number; isActive: boolean }) {
    this.db.prepare(`INSERT INTO employments(game_id, employee_id, employee_name, employer_id, role, salary, hired_round, loyalty, is_active) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(game_id, employee_id) DO UPDATE SET role=excluded.role, salary=excluded.salary, loyalty=excluded.loyalty, is_active=excluded.is_active`)
      .run(gameId, emp.employeeId, emp.employeeName, emp.employerId, emp.role, emp.salary, emp.hiredRound, emp.loyalty, emp.isActive ? 1 : 0);
  }

  getEmployments(gameId: string) {
    return this.db.prepare('SELECT * FROM employments WHERE game_id=? AND is_active=1').all(gameId) as unknown as Array<{
      employee_id: string; employee_name: string; employer_id: string; role: string;
      salary: number; hired_round: number; loyalty: number; is_active: number;
    }>;
  }

  removeEmployment(gameId: string, employeeId: string) {
    this.db.prepare('UPDATE employments SET is_active=0 WHERE game_id=? AND employee_id=?').run(gameId, employeeId);
  }

  // ---- 队伍 ----

  addPartyMember(gameId: string, characterId: string, characterName: string, role: string, round: number) {
    this.db.prepare(`INSERT INTO party_members(game_id, character_id, character_name, role, joined_round, is_active) VALUES(?,?,?,?,?,1) ON CONFLICT(game_id, character_id) DO UPDATE SET role=excluded.role, is_active=1`)
      .run(gameId, characterId, characterName, role, round);
  }

  removePartyMember(gameId: string, characterId: string) {
    this.db.prepare('UPDATE party_members SET is_active=0 WHERE game_id=? AND character_id=?').run(gameId, characterId);
  }

  getPartyMembers(gameId: string) {
    return this.db.prepare('SELECT * FROM party_members WHERE game_id=? AND is_active=1').all(gameId) as unknown as Array<{
      character_id: string; character_name: string; role: string; joined_round: number;
    }>;
  }

  prepare(sql: string) { return this.db.prepare(sql); }

  // ---- 关系 ----
  setRelationship(gameId: string, a: string, b: string, affection: number, trust: number, status: string, round: number) {
    const [c1, c2] = a < b ? [a, b] : [b, a];
    this.db.prepare(`INSERT INTO relationships(game_id,char_a,char_b,affection,trust,status,last_interaction_round) VALUES(?,?,?,?,?,?,?) ON CONFLICT(game_id,char_a,char_b) DO UPDATE SET affection=excluded.affection, trust=excluded.trust, status=excluded.status, last_interaction_round=excluded.last_interaction_round`)
      .run(gameId, c1, c2, affection, trust, status, round);
  }
  getRelation(gameId: string, a: string, b: string) {
    const [c1, c2] = a < b ? [a, b] : [b, a];
    return this.db.prepare('SELECT * FROM relationships WHERE game_id=? AND char_a=? AND char_b=?').get(gameId, c1, c2) as unknown as { affection: number; trust: number; status: string } | undefined;
  }
  getRelationships(gameId: string) {
    return this.db.prepare('SELECT * FROM relationships WHERE game_id=?').all(gameId) as unknown as Array<{ char_a: string; char_b: string; affection: number; trust: number; status: string; last_interaction_round: number }>;
  }

  // ---- 奴隶 ----
  setSlave(gameId: string, charId: string, ownerId: string, slaveType: string, obedience: number, fear: number, breaking: number) {
    this.db.prepare(`INSERT INTO slaves(game_id,character_id,owner_id,slave_type,obedience,fear,breaking_progress) VALUES(?,?,?,?,?,?,?) ON CONFLICT(game_id,character_id) DO UPDATE SET slave_type=excluded.slave_type, obedience=excluded.obedience, fear=excluded.fear, breaking_progress=excluded.breaking_progress`)
      .run(gameId, charId, ownerId, slaveType, obedience, fear, breaking);
  }
  getSlaves(gameId: string) {
    return this.db.prepare('SELECT * FROM slaves WHERE game_id=?').all(gameId) as unknown as Array<{ character_id: string; owner_id: string; slave_type: string; obedience: number; fear: number; breaking_progress: number; escape_attempts: number; last_night_interact_round: number }>;
  }
  updateSlaveInteraction(gameId: string, charId: string, round: number, obDelta: number, fearDelta: number, breakDelta: number) {
    this.db.prepare('UPDATE slaves SET obedience=MAX(0,MIN(100,obedience+?)), fear=MAX(0,MIN(100,fear+?)), breaking_progress=MAX(0,MIN(100,breaking_progress+?)), last_night_interact_round=? WHERE game_id=? AND character_id=?')
      .run(obDelta, fearDelta, breakDelta, round, gameId, charId);
  }

  // ---- 情报 ----
  addIntel(gameId: string, intel: { id: string; content: string; category: string; source: string; truthProbability: number; acquiredRound: number; expiryDay: number; relatedCharacterId?: string; relatedLocationId?: string }) {
    this.db.prepare(`INSERT OR IGNORE INTO intel(game_id,intel_id,content,category,source,truth_probability,acquired_round,expiry_day,related_character_id,related_location_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(gameId, intel.id, intel.content, intel.category, intel.source, intel.truthProbability, intel.acquiredRound, intel.expiryDay, intel.relatedCharacterId ?? null, intel.relatedLocationId ?? null);
  }
  getIntel(gameId: string, includeExpired = false) {
    const currentDay = (this.db.prepare('SELECT day FROM games WHERE id=?').get(gameId) as { day: number } | undefined)?.day ?? 0;
    if (includeExpired) return this.db.prepare('SELECT * FROM intel WHERE game_id=? ORDER BY acquired_round DESC').all(gameId) as unknown as Array<{ intel_id: string; content: string; category: string; source: string; truth_probability: number; acquired_round: number; expiry_day: number; is_verified: number; related_character_id: string | null; related_location_id: string | null }>;
    return this.db.prepare('SELECT * FROM intel WHERE game_id=? AND expiry_day >= ? ORDER BY acquired_round DESC').all(gameId, currentDay) as unknown as Array<{ intel_id: string; content: string; category: string; source: string; truth_probability: number; acquired_round: number; expiry_day: number; is_verified: number; related_character_id: string | null; related_location_id: string | null }>;
  }
  verifyIntel(gameId: string, intelId: string, truthProb: number) {
    this.db.prepare('UPDATE intel SET is_verified=1, truth_probability=? WHERE game_id=? AND intel_id=?').run(truthProb, gameId, intelId);
  }

  // ---- 行动模板 ----
  getAllActionTemplates() {
    return this.db.prepare('SELECT * FROM action_templates ORDER BY priority ASC').all() as unknown as Array<{
      kind: string; label: string; detail: string | null; category: string;
      cost_phases: number; cost_stamina: number; cost_hunger: number;
      conditions_json: string; priority: number;
    }>;
  }

  // ---- 背包 ----
  addItem(gameId: string, item: { id: string; name: string; itemType: string; quantity: number; description: string; value: number; effects?: Record<string, number> }) {
    this.db.prepare(`INSERT INTO inventory(game_id,item_id,name,item_type,quantity,description,value,effects_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(game_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity`)
      .run(gameId, item.id, item.name, item.itemType, item.quantity, item.description, item.value, JSON.stringify(item.effects ?? {}));
  }
  removeItem(gameId: string, itemId: string, qty: number) {
    const row = this.db.prepare('SELECT quantity FROM inventory WHERE game_id=? AND item_id=?').get(gameId, itemId) as { quantity: number } | undefined;
    if (!row) return;
    if (row.quantity <= qty) this.db.prepare('DELETE FROM inventory WHERE game_id=? AND item_id=?').run(gameId, itemId);
    else this.db.prepare('UPDATE inventory SET quantity=quantity-? WHERE game_id=? AND item_id=?').run(qty, gameId, itemId);
  }
  getInventory(gameId: string) {
    return this.db.prepare('SELECT * FROM inventory WHERE game_id=? AND quantity>0').all(gameId) as unknown as Array<{
      item_id: string; name: string; item_type: string; quantity: number; description: string; value: number; effects_json: string; is_equipped: number; equipped_slot: string | null;
    }>;
  }
  hasItemOfType(gameId: string, itemType: string) {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM inventory WHERE game_id=? AND item_type=? AND quantity>0').get(gameId, itemType) as { c: number };
    return row.c > 0;
  }

  // ---- 任务 ----
  addQuest(gameId: string, quest: { id: string; name: string; description: string; category: string; objectives: Array<{ id: string; description: string; type: string; target: string; required: number; current: number; isCompleted: boolean }>; rewards: Record<string, unknown>; giverId?: string; deadlineDay?: number; acquiredRound: number }) {
    this.db.prepare(`INSERT OR IGNORE INTO quests(game_id,quest_id,name,description,category,status,objectives_json,rewards_json,giver_id,deadline_day,acquired_round) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(gameId, quest.id, quest.name, quest.description, quest.category, 'active', JSON.stringify(quest.objectives), JSON.stringify(quest.rewards), quest.giverId ?? null, quest.deadlineDay ?? null, quest.acquiredRound);
  }
  updateQuestProgress(gameId: string, questId: string, objectiveId: string, progress: number) {
    const q = this.db.prepare('SELECT objectives_json FROM quests WHERE game_id=? AND quest_id=?').get(gameId, questId) as { objectives_json: string } | undefined;
    if (!q) return;
    const objectives = JSON.parse(q.objectives_json) as Array<{ id: string; current: number; required: number; isCompleted: boolean }>;
    const obj = objectives.find(o => o.id === objectiveId);
    if (!obj) return;
    obj.current += progress;
    if (obj.current >= obj.required) { obj.current = obj.required; obj.isCompleted = true; }
    this.db.prepare('UPDATE quests SET objectives_json=? WHERE game_id=? AND quest_id=?').run(JSON.stringify(objectives), gameId, questId);
    if (objectives.every(o => o.isCompleted)) {
      this.db.prepare('UPDATE quests SET status=? WHERE game_id=? AND quest_id=?').run('completed', gameId, questId);
    }
  }
  getQuests(gameId: string) {
    return this.db.prepare('SELECT * FROM quests WHERE game_id=?').all(gameId) as unknown as Array<{
      quest_id: string; name: string; description: string; category: string; status: string;
      objectives_json: string; rewards_json: string; giver_id: string | null; deadline_day: number | null;
      acquired_round: number; completed_round: number | null;
    }>;
  }
}
