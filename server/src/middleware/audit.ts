import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma.js';

const METHOD_TH: Record<string, string> = { POST: 'เพิ่ม', PUT: 'แก้ไข', PATCH: 'แก้ไข', DELETE: 'ลบ' };

const RESOURCE_TH: Record<string, string> = {
  products: 'สินค้า', categories: 'หมวดหมู่', suppliers: 'ผู้จำหน่าย', inventory: 'สต็อก',
  'stock-counts': 'การนับสต็อก', sales: 'การขาย', settings: 'การตั้งค่า', users: 'ผู้ใช้งาน',
  members: 'สมาชิก', shifts: 'กะการขาย', promotions: 'โปรโมชั่น', 'held-bills': 'บิลพักไว้',
  license: 'ลิขสิทธิ์', setup: 'การติดตั้ง', print: 'การพิมพ์', 'purchase-orders': 'ใบสั่งซื้อ',
  returns: 'การคืนสินค้า', branches: 'สาขา', transfers: 'การโอนสินค้า', expenses: 'ค่าใช้จ่าย', auth: 'การเข้าสู่ระบบ',
};

/** Turn a method + API path into a short human-readable Thai action label. */
function describe(method: string, path: string): string {
  const parts = path.replace(/^\/api\//, '').split('/').filter(Boolean);
  const resource = parts[0] ?? '';
  // A few high-signal special cases.
  if (resource === 'sales' && parts[2] === 'void') return 'ยกเลิกบิล';
  if (resource === 'sales' && method === 'POST' && parts.length === 1) return 'ขายสินค้า / สร้างบิล';
  if (resource === 'shifts' && parts[2] === 'close') return 'ปิดกะ';
  if (resource === 'shifts' && parts[2] === 'cash') return 'บันทึกเงินเข้า-ออก';
  if (resource === 'shifts' && parts[2] === 'open') return 'เปิดกะ';
  if (resource === 'auth' && parts[1] === 'login') return 'เข้าสู่ระบบ';
  if (resource === 'members' && parts[2] === 'points') return 'ปรับแต้มสมาชิก';
  const verb = METHOD_TH[method] ?? method;
  const noun = RESOURCE_TH[resource] ?? resource;
  return `${verb}${noun}`;
}

/**
 * App-level middleware: records every mutating /api request to the AuditLog after
 * the response finishes (by which point requireAuth has populated req.user). GETs
 * and non-API paths are skipped. Writes are fire-and-forget so they never block or
 * fail a request.
 */
export function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || !req.path.startsWith('/api/')) {
    return next();
  }
  // Capture the original URL now — inside the `finish` handler req.path/req.url
  // have been rewritten to the matched router's relative path.
  const fullPath = req.originalUrl.split('?')[0];
  res.on('finish', () => {
    const ipHeader = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(ipHeader) ? ipHeader[0] : ipHeader)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    prisma.auditLog
      .create({
        data: {
          userId: req.user?.id ?? null,
          userName: req.user?.name ?? '',
          role: req.user?.role ?? '',
          method: req.method,
          path: fullPath,
          action: describe(req.method, fullPath),
          status: res.statusCode,
          ip,
        },
      })
      .catch(() => {});
  });
  next();
}
