import { DatabaseSync } from 'node:sqlite';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { WorldState, GameEvent, TurnResolution } from '@gray-hill/engine';

const DB_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DB_DIR, 'gray-hill.db');

@Injectable()
export class DatabaseService implements OnModuleInit {
  readonly db: DatabaseSync;

  constructor() {
    mkdirSync(DB_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
  }

  onModuleInit() {
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      -- 游戏存档表
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

      -- 回合事件表（因果链可追溯）
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        day INTEGER NOT NULL,
        phase TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        category TEXT NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        location_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        caused_by_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_events_game_round ON events(game_id, round);

      -- 叙事记录表（存AI生成的叙事文本）
      CREATE TABLE IF NOT EXISTS narratives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        day INTEGER NOT NULL,
        phase TEXT NOT NULL,
        viewpoint_actor_id TEXT NOT NULL DEFAULT 'player',
        body TEXT NOT NULL,
        mood TEXT,
        facts_json TEXT NOT NULL DEFAULT '[]',
        related_characters_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_narratives_game_round ON narratives(game_id, round);

      -- 行动日志表
      CREATE TABLE IF NOT EXISTS action_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        result_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_action_log_game ON action_log(game_id, round);

      -- 死亡记录表
      CREATE TABLE IF NOT EXISTS death_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        character_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        location_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );

      -- 世界快照表（每N回合保存一次完整快照用于回溯）
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_game ON snapshots(game_id, round);
    `);
  }

  // ---- 游戏存取 ----

  saveGame(id: string, world: WorldState, playerName: string, difficulty: string, popScale: string) {
    const json = JSON.stringify(world);
    this.db.prepare(`
      INSERT INTO games(id, player_name, difficulty, population_scale, state_json, updated_at)
      VALUES(?,?,?,?,?,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = datetime('now')
    `).run(id, playerName, difficulty, popScale, json);
  }

  loadGame(id: string): { state: WorldState; meta: { playerName: string; difficulty: string; populationScale: string } } | null {
    const row = this.db.prepare(
      'SELECT state_json, player_name, difficulty, population_scale FROM games WHERE id=? AND is_active=1'
    ).get(id) as { state_json: string; player_name: string; difficulty: string; population_scale: string } | undefined;
    if (!row) return null;
    return {
      state: JSON.parse(row.state_json) as WorldState,
      meta: { playerName: row.player_name, difficulty: row.difficulty, populationScale: row.population_scale },
    };
  }

  // ---- 事件存取 ----

  saveEvents(gameId: string, events: GameEvent[]) {
    const stmt = this.db.prepare(`
      INSERT INTO events(game_id, round, day, phase, event_id, event_type, category, actor_id, target_id, location_id, title, description, payload_json, caused_by_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const evt of events) {
      stmt.run(
        gameId, evt.round, evt.day, evt.phase, evt.id, evt.type, evt.category,
        evt.actorId ?? null, evt.targetId ?? null, evt.locationId ?? null,
        evt.title, evt.description,
        JSON.stringify(evt.payload),
        JSON.stringify(evt.causedBy),
      );
    }
  }

  getEvents(gameId: string, limit = 100) {
    return this.db.prepare(
      'SELECT * FROM events WHERE game_id=? ORDER BY id DESC LIMIT ?'
    ).all(gameId, limit);
  }

  // ---- 叙事存取 ----

  saveNarrative(
    gameId: string, round: number, day: number, phase: string,
    viewpointActorId: string, body: string, mood: string,
    facts: string[], relatedCharacters: string[],
  ) {
    this.db.prepare(`
      INSERT INTO narratives(game_id, round, day, phase, viewpoint_actor_id, body, mood, facts_json, related_characters_json)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(gameId, round, day, phase, viewpointActorId, body, mood,
      JSON.stringify(facts), JSON.stringify(relatedCharacters));
  }

  getRecentNarrative(gameId: string) {
    return this.db.prepare(
      'SELECT body, mood, round, day, phase FROM narratives WHERE game_id=? ORDER BY id DESC LIMIT 1'
    ).get(gameId) as { body: string; mood: string; round: number; day: number; phase: string } | undefined;
  }

  getNarratives(gameId: string, limit = 50) {
    return this.db.prepare(
      'SELECT * FROM narratives WHERE game_id=? ORDER BY id DESC LIMIT ?'
    ).all(gameId, limit);
  }

  // ---- 行动日志 ----

  saveAction(gameId: string, round: number, actorId: string, actorName: string, intent: unknown, summary: string) {
    this.db.prepare(`
      INSERT INTO action_log(game_id, round, actor_id, actor_name, intent_json, result_summary)
      VALUES(?,?,?,?,?,?)
    `).run(gameId, round, actorId, actorName, JSON.stringify(intent), summary);
  }

  // ---- 死亡记录 ----

  saveDeaths(gameId: string, deaths: Array<{ characterId: string; name: string; reason: string; locationId: string; round: number }>) {
    const stmt = this.db.prepare(`
      INSERT INTO death_log(game_id, round, character_id, character_name, reason, location_id)
      VALUES(?,?,?,?,?,?)
    `);
    for (const d of deaths) {
      stmt.run(gameId, d.round, d.characterId, d.name, d.reason, d.locationId);
    }
  }

  getDeathLog(gameId: string, limit = 30) {
    return this.db.prepare(
      'SELECT * FROM death_log WHERE game_id=? ORDER BY id DESC LIMIT ?'
    ).all(gameId, limit);
  }

  // ---- 快照 ----

  saveSnapshot(gameId: string, round: number, state: WorldState) {
    this.db.prepare(`
      INSERT INTO snapshots(game_id, round, state_json) VALUES(?,?,?)
    `).run(gameId, round, JSON.stringify(state));
  }

  // ---- 日志汇总 ----

  getFullLog(gameId: string) {
    return {
      events: this.getEvents(gameId, 200),
      narratives: this.getNarratives(gameId, 100),
      deaths: this.getDeathLog(gameId, 50),
    };
  }
}
