/**
 * VFD customer pole-display builder (2×20 character displays) + raw-TCP sender.
 *
 * Targets the de-facto-standard **CD5220** command set used by most 2-line pole
 * displays (Epson DM-D compatible clones: Posiflex/PartnerTech/Bematech, etc.):
 *   ESC @            (0x1B 0x40)  initialise / clear
 *   CLR              (0x0C)       clear screen
 *   ESC Q A … CR     (0x1B 0x51 0x41 … 0x0D)  write the UPPER line (overwrite mode)
 *   ESC Q B … CR     (0x1B 0x51 0x42 … 0x0D)  write the LOWER line (overwrite mode)
 *
 * VFDs are ASCII devices — Thai glyphs don't render — so all text is reduced to a
 * printable-ASCII subset (Thai/other → '?') and each line is padded/truncated to the
 * display width (20 by default). Transport is the same raw TCP path as the network
 * printer (a serial-to-Ethernet bridge or the printer's DM-D pass-through on :9100).
 *
 * This module is pure (no DB); the route flattens settings/state and calls it.
 */
import net from 'node:net';

const ESC = 0x1b;
const CLR = 0x0c;
const CR = 0x0d;
export const VFD_WIDTH = 20;

/** Reduce a string to printable ASCII (0x20–0x7e); anything else → '?'. */
function asciiBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out.push(c >= 0x20 && c <= 0x7e ? c : 0x3f);
  }
  return out;
}

/** Pad (right) or truncate `s` to exactly `width` columns. */
export function fitLine(s: string, width = VFD_WIDTH): string {
  const t = (s ?? '').slice(0, width);
  return t + ' '.repeat(Math.max(0, width - t.length));
}

/** "label" left, "value" right-aligned within `width` columns (value wins on overflow). */
export function twoCol(left: string, right: string, width = VFD_WIDTH): string {
  const r = right.slice(0, width);
  const space = Math.max(1, width - left.length - r.length);
  const l = left.slice(0, Math.max(0, width - r.length - space));
  return (l + ' '.repeat(space) + r).slice(0, width);
}

const money = (v: number | string) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

class Builder {
  private parts: number[] = [];
  raw(...b: number[]) { this.parts.push(...b); return this; }
  init() { return this.raw(ESC, 0x40); }
  clear() { return this.raw(CLR); }
  upper(s: string) { return this.raw(ESC, 0x51, 0x41, ...asciiBytes(fitLine(s)), CR); }
  lower(s: string) { return this.raw(ESC, 0x51, 0x42, ...asciiBytes(fitLine(s)), CR); }
  done() { return Buffer.from(this.parts); }
}

/** Build the byte stream for an explicit two-line message. */
export function buildVfdLines(line1: string, line2 = '', width = VFD_WIDTH): Buffer {
  return new Builder().init().clear().upper(fitLine(line1, width)).lower(fitLine(line2, width)).done();
}

// A trimmed view of the POS DisplayState — only what the 2×20 display needs.
export interface VfdState {
  status: 'IDLE' | 'CART' | 'PAYMENT' | 'PAID';
  storeName?: string;
  items?: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
  total?: number;
  change?: number;
}

/**
 * Render the current POS state to two lines. The classic pole-display behaviour:
 * show the most-recently-added item + a running total while ringing up, the amount
 * due at payment, and the change + a thank-you when paid.
 */
export function buildVfdFromState(state: VfdState, width = VFD_WIDTH): Buffer {
  let l1 = '';
  let l2 = '';
  switch (state.status) {
    case 'PAID':
      l1 = twoCol('CHANGE', money(state.change ?? 0), width);
      l2 = fitLine('THANK YOU', width);
      break;
    case 'PAYMENT':
      l1 = twoCol('TOTAL', money(state.total ?? 0), width);
      l2 = fitLine('PLEASE PAY', width);
      break;
    case 'CART': {
      const last = state.items && state.items.length ? state.items[state.items.length - 1] : null;
      l1 = last ? twoCol(last.name, money(last.lineTotal), width) : fitLine(state.storeName || 'POS', width);
      l2 = twoCol('TOTAL', money(state.total ?? 0), width);
      break;
    }
    case 'IDLE':
    default:
      l1 = fitLine(state.storeName || 'WELCOME', width);
      l2 = fitLine('', width);
      break;
  }
  return buildVfdLines(l1, l2, width);
}

/** A short connectivity-test message. */
export function buildVfdTest(storeName = 'POS', width = VFD_WIDTH): Buffer {
  return buildVfdLines(fitLine(storeName, width), fitLine('VFD TEST OK', width), width);
}

export function parseVfdAddress(addr: string): { host: string; port: number } | null {
  const s = (addr || '').trim();
  if (!s) return null;
  const [host, port] = s.split(':');
  if (!host) return null;
  return { host, port: port ? Number(port) : 9100 };
}

/** Open a raw TCP socket and write the buffer. Resolves on flush, rejects on error/timeout. */
export function sendToVfd(host: string, port: number, buf: Buffer, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const sock = net.createConnection({ host, port });
    const fail = (e: Error) => { if (!settled) { settled = true; sock.destroy(); reject(e); } };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => sock.write(buf, () => sock.end()));
    sock.on('error', fail);
    sock.on('timeout', () => fail(new Error('การเชื่อมต่อจอแสดงผลหมดเวลา')));
    sock.on('close', () => { if (!settled) { settled = true; resolve(); } });
  });
}
