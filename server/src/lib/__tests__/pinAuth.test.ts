import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { matchPin } from '../pinAuth.js';

describe('matchPin', () => {
  it('returns the user whose pinHash matches', async () => {
    const users = [
      { id: 1, name: 'A', pinHash: await bcrypt.hash('1111', 8) },
      { id: 2, name: 'B', pinHash: await bcrypt.hash('4321', 8) },
    ];
    expect((await matchPin(users, '4321'))?.id).toBe(2);
  });
  it('returns null on no match', async () => {
    const users = [{ id: 1, name: 'A', pinHash: await bcrypt.hash('1111', 8) }];
    expect(await matchPin(users, '9999')).toBeNull();
  });
  it('skips users with no pinHash and ignores an empty pin', async () => {
    const users = [{ id: 1, name: 'A', pinHash: null }, { id: 2, name: 'B', pinHash: await bcrypt.hash('1111', 8) }];
    expect((await matchPin(users, '1111'))?.id).toBe(2);
    expect(await matchPin(users, '')).toBeNull();
  });
});
