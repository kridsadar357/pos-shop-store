import { describe, it, expect } from 'vitest';
import { buildVfdLines, buildVfdFromState, buildVfdTest, fitLine, twoCol, VFD_WIDTH } from '../vfd.js';

const hex = (b: Buffer) => b.toString('hex');
// Extract the upper/lower line payloads (ASCII between the command prefix and CR).
function lines(b: Buffer): [string, string] {
  const s = b.toString('latin1');
  const up = s.match(/\x1bQA([^\r]*)\r/);
  const lo = s.match(/\x1bQB([^\r]*)\r/);
  return [up?.[1] ?? '', lo?.[1] ?? ''];
}

describe('vfd column helpers', () => {
  it('fitLine pads to exactly the width', () => {
    expect(fitLine('hi')).toBe('hi' + ' '.repeat(VFD_WIDTH - 2));
    expect(fitLine('hi').length).toBe(20);
  });
  it('fitLine truncates overflow', () => {
    expect(fitLine('x'.repeat(30))).toBe('x'.repeat(20));
  });
  it('twoCol right-aligns the value within the width', () => {
    const r = twoCol('TOTAL', '99.00');
    expect(r).toBe('TOTAL' + ' '.repeat(10) + '99.00');
    expect(r.length).toBe(20);
  });
});

describe('buildVfdLines (CD5220 framing)', () => {
  it('starts with init + clear (ESC @, FF)', () => {
    expect(hex(buildVfdLines('a', 'b')).startsWith('1b400c')).toBe(true);
  });
  it('writes upper line via ESC Q A … CR and lower via ESC Q B … CR', () => {
    const h = hex(buildVfdLines('a', 'b'));
    expect(h).toContain('1b5141'); // ESC Q A
    expect(h).toContain('1b5142'); // ESC Q B
    expect(h).toContain('0d'); // CR terminators
  });
  it('pads both lines to 20 chars', () => {
    const [u, l] = lines(buildVfdLines('hi', 'yo'));
    expect(u.length).toBe(20);
    expect(l.length).toBe(20);
  });
});

describe('buildVfdFromState', () => {
  it('IDLE shows the store name + blank', () => {
    const [u, l] = lines(buildVfdFromState({ status: 'IDLE', storeName: 'MyShop' }));
    expect(u.trim()).toBe('MyShop');
    expect(l.trim()).toBe('');
  });
  it('CART shows the last item + running total', () => {
    const [u, l] = lines(buildVfdFromState({
      status: 'CART',
      items: [
        { name: 'Water', qty: 1, unitPrice: 10, lineTotal: 10 },
        { name: 'Cola', qty: 2, unitPrice: 15, lineTotal: 30 },
      ],
      total: 40,
    }));
    expect(u).toContain('Cola');
    expect(u).toContain('30.00');
    expect(l).toContain('TOTAL');
    expect(l).toContain('40.00');
  });
  it('PAYMENT shows the amount due', () => {
    const [u, l] = lines(buildVfdFromState({ status: 'PAYMENT', total: 123.5 }));
    expect(u).toContain('TOTAL');
    expect(u).toContain('123.50');
    expect(l.trim()).toBe('PLEASE PAY');
  });
  it('PAID shows change + thank you', () => {
    const [u, l] = lines(buildVfdFromState({ status: 'PAID', change: 60 }));
    expect(u).toContain('CHANGE');
    expect(u).toContain('60.00');
    expect(l.trim()).toBe('THANK YOU');
  });
  it('reduces non-ASCII (Thai) text to ? so the VFD never gets raw UTF-8', () => {
    const [u] = lines(buildVfdFromState({ status: 'IDLE', storeName: 'ร้านค้า' }));
    expect(u).toMatch(/^\?+\s*$/);
  });
});

describe('buildVfdTest', () => {
  it('renders the store name + an OK marker', () => {
    const [u, l] = lines(buildVfdTest('Shop'));
    expect(u.trim()).toBe('Shop');
    expect(l.trim()).toBe('VFD TEST OK');
  });
});
