import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { buildPromptPayPayload, type PromptPayType } from '../lib/promptpay.js';
import { resolvedSettings } from '../lib/branchSettings.js';
import { buildReceipt, buildTestSlip, buildDrawerKick, parsePrinterAddress, sendToPrinter } from '../lib/escpos.js';

export const printRouter = Router();
printRouter.use(requireAuth);

/** Print a sale's receipt to the configured network thermal printer (ESC/POS). */
printRouter.post(
  '/receipt/:saleId',
  ah(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(req.params.saleId) },
      include: { items: true, cashier: { select: { name: true } }, member: { select: { name: true, phone: true } } },
    });
    if (!sale) return res.status(404).json({ error: 'ไม่พบบิล' });

    const setting = await resolvedSettings(sale.branchId);
    if (setting.printerType !== 'ESCPOS_NET') {
      return res.status(400).json({ error: 'ตั้งค่าการพิมพ์เป็นแบบเบราว์เซอร์ — ใช้กล่องพิมพ์ของระบบแทน' });
    }
    const addr = parsePrinterAddress(setting.printerAddress);
    if (!addr) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่าที่อยู่เครื่องพิมพ์ (IP:Port)' });

    let qr = '';
    if (setting.receiptShowQR && setting.promptPayId) {
      qr = buildPromptPayPayload({ id: setting.promptPayId, type: setting.promptPayType as PromptPayType, amount: Number(sale.total) });
    }
    const buf = buildReceipt(sale as any, setting as any, { qr });
    try {
      await sendToPrinter(addr.host, addr.port, buf);
      res.json({ ok: true, bytes: buf.length, printer: `${addr.host}:${addr.port}` });
    } catch (e) {
      res.status(502).json({ error: `พิมพ์ไม่สำเร็จ: ${(e as Error).message}` });
    }
  })
);

/** Pop the cash drawer (ESC/POS pulse) on the configured network printer. */
printRouter.post(
  '/drawer',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const setting = await resolvedSettings(branchId);
    if (setting.printerType !== 'ESCPOS_NET') {
      return res.status(400).json({ error: 'เปิดลิ้นชักได้เฉพาะเครื่องพิมพ์เครือข่าย (ESC/POS)' });
    }
    const addr = parsePrinterAddress(setting.printerAddress);
    if (!addr) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่าที่อยู่เครื่องพิมพ์ (IP:Port)' });
    try {
      await sendToPrinter(addr.host, addr.port, buildDrawerKick(setting as any));
      res.json({ ok: true, printer: `${addr.host}:${addr.port}` });
    } catch (e) {
      res.status(502).json({ error: `เปิดลิ้นชักไม่สำเร็จ: ${(e as Error).message}` });
    }
  })
);

/** Send a short connectivity test slip to the configured printer. */
printRouter.post(
  '/test',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const setting = await resolvedSettings(branchId);
    if (setting.printerType !== 'ESCPOS_NET') {
      return res.status(400).json({ error: 'การทดสอบนี้ใช้กับเครื่องพิมพ์เครือข่าย (ESC/POS) เท่านั้น' });
    }
    const addr = parsePrinterAddress(setting.printerAddress);
    if (!addr) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่าที่อยู่เครื่องพิมพ์ (IP:Port)' });
    try {
      await sendToPrinter(addr.host, addr.port, buildTestSlip(setting as any));
      res.json({ ok: true, printer: `${addr.host}:${addr.port}` });
    } catch (e) {
      res.status(502).json({ error: `เชื่อมต่อเครื่องพิมพ์ไม่ได้: ${(e as Error).message}` });
    }
  })
);
