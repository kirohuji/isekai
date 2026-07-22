import { describe, expect, it } from 'vitest';
import { resolveRound, type WorldState } from './index.js';
const world: WorldState = { round: 1, day: 1, phase: 'night', difficulty: 'survival', seed: 7, food: 1, medicine: 0, silver: 120, playerId: 'p1', actors: [{ id: 'p1', name: '主角', locationId: 'square', health: 100, maxHealth: 100, mental: 100, maxMental: 100, stamina: 80, maxStamina: 100, hunger: 0, alive: true, isPlayer: true }] };
describe('resolveRound', () => { it('advances a day and consumes food after night', () => { const result = resolveRound(world, [{ actorId: 'p1', kind: 'rest' }]); expect(result.state.day).toBe(2); expect(result.state.food).toBe(0); expect(result.state.phase).toBe('dawn'); }); });
