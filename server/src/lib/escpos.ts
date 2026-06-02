/**
 * Minimal ESC/POS receipt builder + raw-TCP sender for network thermal printers
 * (RAW / JetDirect, usually port 9100).
 *
 * Thai is emitted as TIS-620 with a code-page select (ESC t). The exact Thai
 * code page is vendor-specific; override via env ESCPOS_THAI_CODEPAGE if your
 * printer needs a different value (common: 21 on many Xprinter/Gprinter units,
 * 255 on some Epson TM models). Default = 21.
 */
import net from 'node:net';

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;
const DEFAULT_THAI_CODEPAGE = Number(process.env.ESCPOS_THAI_CODEPAGE || 21);

/** Encode a string to TIS-620 bytes (ASCII passthrough; Thai block → 0xA1–0xFB). */
function encodeThai(s: string): Buffer {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c <= 0x7f) out.push(c);
    else if (c >= 0x0e01 && c <= 0x0e5b) out.push(c - 0x0e00 + 0xa0);
    else out.push(0x3f); // '?'
  }
  return Buffer.from(out);
}

export interface ReceiptLine { nameSnapshot: string; qty: number; unitPrice: any; lineTotal: any }
export interface ReceiptSale {
  orderNo: string; createdAt: Date; type: string; subtotal: any; discount: any; taxAmount: any;
  total: any; paymentMethod: string; cashReceived: any; changeDue: any;
  cashier?: { name: string } | null; member?: { name: string; phone: string } | null; items: ReceiptLine[];
}
export interface ReceiptSetting {
  storeName: string; address: string; phone: string; taxId: string;
  receiptHeader: string; receiptFooter: string; taxRatePct: any; taxInclusive: boolean;
  printerPaper: string; currency: string;
  escposCodepage?: number; openDrawerOnCash?: boolean;
}

const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน/พร้อมเพย์', CARD: 'บัตร', CREDIT: 'เงินเชื่อ' };
const n2 = (v: any) => Number(v).toFixed(2);

class Builder {
  private parts: Buffer[] = [];
  raw(...b: number[]) { this.parts.push(Buffer.from(b)); return this; }
  init(codepage: number = DEFAULT_THAI_CODEPAGE) { return this.raw(ESC, 0x40).raw(ESC, 0x74, codepage & 0xff); }
  /** Cash-drawer kick: ESC p 0 (pin 2) on/off pulse durations. */
  drawer() { return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa); }
  align(n: 0 | 1 | 2) { return this.raw(ESC, 0x61, n); }
  bold(on: boolean) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(w: number, h: number) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); } // 1..8
  text(s: string) { this.parts.push(encodeThai(s)); return this; }
  line(s = '') { return this.text(s).raw(LF); }
  feed(n = 1) { for (let i = 0; i < n; i++) this.raw(LF); return this; }
  rule(width: number) { return this.line('-'.repeat(width)); }
  /** label left, value right-aligned within `width` columns. */
  cols(left: string, right: string, width: number) {
    const space = Math.max(1, width - left.length - right.length);
    return this.line(left + ' '.repeat(space) + right);
  }
  /** Native ESC/POS QR code (model 2). */
  qr(data: string, module = 6) {
    const d = encodeThai(data);
    const store = Buffer.concat([Buffer.from([GS, 0x28, 0x6b, (d.length + 3) & 0xff, ((d.length + 3) >> 8) & 0xff, 0x31, 0x50, 0x30]), d]);
    this.align(1)
      .raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)       // model 2
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, module)            // module size
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);             // error correction M
    this.parts.push(store);
    return this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);    // print
  }
  cut() { return this.feed(3).raw(GS, 0x56, 0x42, 0x00); } // feed + partial cut
  done() { return Buffer.concat(this.parts); }
}

export function buildReceipt(sale: ReceiptSale, setting: ReceiptSetting, opts: { qr?: string } = {}): Buffer {
  const W = setting.printerPaper === '58mm' ? 32 : 42;
  const b = new Builder().init(setting.escposCodepage);
  // Open the cash drawer up-front on a cash sale (if enabled).
  if (sale.paymentMethod === 'CASH' && setting.openDrawerOnCash !== false) b.drawer();

  // Header
  b.align(1).bold(true).size(2, 2).line(setting.storeName || 'POS Store').size(1, 1).bold(false);
  if (setting.address) b.line(setting.address);
  if (setting.phone) b.line('โทร. ' + setting.phone);
  if (setting.taxId) b.line('เลขผู้เสียภาษี ' + setting.taxId);
  if (setting.receiptHeader) b.line(setting.receiptHeader);

  b.align(0).rule(W);
  b.cols('เลขที่บิล', sale.orderNo, W);
  b.cols('วันที่', new Date(sale.createdAt).toLocaleString('th-TH'), W);
  if (sale.cashier?.name) b.cols('แคชเชียร์', sale.cashier.name, W);
  if (sale.member) b.cols('สมาชิก', sale.member.name, W);
  b.rule(W);

  for (const it of sale.items) {
    b.line(it.nameSnapshot);
    b.cols(`  ${it.qty} x ${n2(it.unitPrice)}`, n2(it.lineTotal), W);
  }

  b.rule(W);
  b.cols('รวมราคาสินค้า', n2(sale.subtotal), W);
  if (Number(sale.discount) > 0) b.cols('ส่วนลด', '-' + n2(sale.discount), W);
  b.cols(`ภาษี${setting.taxInclusive ? '(รวม)' : ''} ${Number(setting.taxRatePct)}%`, n2(sale.taxAmount), W);
  b.rule(W);
  b.bold(true).size(2, 1).cols('สุทธิ', n2(sale.total), Math.floor(W / 2)).size(1, 1).bold(false);
  b.cols('ชำระโดย', PM[sale.paymentMethod] ?? sale.paymentMethod, W);
  if (sale.paymentMethod === 'CASH') {
    b.cols('รับเงิน', n2(sale.cashReceived), W);
    b.cols('เงินทอน', n2(sale.changeDue), W);
  }

  if (opts.qr) {
    b.rule(W).align(1).line('สแกนเพื่อชำระ (PromptPay)').qr(opts.qr).line(n2(sale.total) + ' ' + (setting.currency || 'THB'));
  }

  b.align(1).rule(W).line(setting.receiptFooter || 'ขอบคุณที่ใช้บริการ').line('*** ' + sale.orderNo + ' ***');
  return b.cut().done();
}

/** A standalone cash-drawer kick (no print). */
export function buildDrawerKick(setting?: ReceiptSetting): Buffer {
  return new Builder().init(setting?.escposCodepage).drawer().done();
}

/** A short connectivity test slip. */
export function buildTestSlip(setting: ReceiptSetting): Buffer {
  return new Builder().init(setting.escposCodepage)
    .align(1).bold(true).size(2, 2).line('ทดสอบการพิมพ์').size(1, 1).bold(false)
    .line(setting.storeName || 'POS Store')
    .line(new Date().toLocaleString('th-TH'))
    .feed(1).line('เครื่องพิมพ์เชื่อมต่อสำเร็จ ✓'.replace('✓', 'OK'))
    .cut().done();
}

export function parsePrinterAddress(addr: string): { host: string; port: number } | null {
  const s = (addr || '').trim();
  if (!s) return null;
  const [host, port] = s.split(':');
  if (!host) return null;
  return { host, port: port ? Number(port) : 9100 };
}

/** Open a raw TCP socket and write the buffer. Resolves on flush, rejects on error/timeout. */
export function sendToPrinter(host: string, port: number, buf: Buffer, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const sock = net.createConnection({ host, port });
    const fail = (e: Error) => { if (!settled) { settled = true; sock.destroy(); reject(e); } };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => sock.write(buf, () => sock.end()));
    sock.on('error', fail);
    sock.on('timeout', () => fail(new Error('การเชื่อมต่อเครื่องพิมพ์หมดเวลา')));
    sock.on('close', () => { if (!settled) { settled = true; resolve(); } });
  });
}
