import { describe, it, expect } from 'vitest';
import { baseFromForeign, foreignFromBase, fxNote } from '../fx.js';

describe('fx', () => {
  it('converts foreign → base (THB) at the configured rate', () => {
    expect(baseFromForeign(20, 35)).toBe(700);
    expect(baseFromForeign(19.99, 35.5)).toBe(709.65);
  });

  it('converts base (THB) → foreign for change display', () => {
    expect(foreignFromBase(700, 35)).toBe(20);
    expect(foreignFromBase(710, 35)).toBe(20.29); // rounded to 2dp
  });

  it('guards a zero/unset rate (no divide-by-zero)', () => {
    expect(foreignFromBase(700, 0)).toBe(0);
    expect(baseFromForeign(20, 0)).toBe(0);
  });

  it('round-trips within rounding', () => {
    const rate = 35;
    expect(foreignFromBase(baseFromForeign(20, rate), rate)).toBe(20);
  });

  it('formats a readable tender note', () => {
    expect(fxNote(20, 'USD', 35)).toBe('20.00 USD @ 35');
  });
});
