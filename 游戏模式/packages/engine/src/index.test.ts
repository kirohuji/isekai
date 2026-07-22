import { describe, expect, it } from 'vitest';
import { createWorld, resolveTurn } from './index.js';

describe('createWorld', () => {
  it('creates a world with correct defaults', () => {
    const world = createWorld({ playerName: '测试', difficulty: 'survival', populationScale: 'small' });
    expect(world.playerId).toBe('player');
    expect(world.round).toBe(0);
    expect(world.day).toBe(1);
    expect(world.phase).toBe('morning');
    expect(world.characters.length).toBeGreaterThan(1);
    expect(world.factions.length).toBeGreaterThan(0);
    expect(world.locations.length).toBeGreaterThan(5);
  });
});

describe('resolveTurn', () => {
  it('advances round and phase', () => {
    const world = createWorld({ playerName: '测试', difficulty: 'survival', populationScale: 'small' });
    const player = world.characters.find(c => c.id === 'player')!;
    const result = resolveTurn(world,
      { actorId: 'player', kind: 'rest', label: '休息' },
      [],
      0,
    );
    expect(result.state.round).toBe(1);
    expect(result.state.phase).not.toBe('morning');
    expect(result.events.length).toBeGreaterThan(0);
  });
});
