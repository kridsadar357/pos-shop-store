import type { PrismaClient } from '@prisma/client';
import { computeDailySummary, shouldSendDailyReport } from './dailyReport.js';
import { buildDailySummaryEmail } from './dailyReportEmail.js';
import { sendMail } from './mailer.js';

/** Local "YYYY-MM-DD" for a date. */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local start/end-of-day bounds for a "YYYY-MM-DD" string. */
function dayBounds(dateStr: string): { from: Date; to: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { from: new Date(y, m - 1, d, 0, 0, 0, 0), to: new Date(y, m - 1, d, 23, 59, 59, 999) };
}

/**
 * Compute + email the daily summary for `dateStr`. `to` overrides the configured
 * recipient. Throws (400-tagged) if there's no recipient or SMTP is unconfigured.
 */
export async function sendDailyReport(prisma: PrismaClient, dateStr: string, to?: string): Promise<{ to: string; orders: number }> {
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
  const recipient = (to || setting.reportEmailTo || '').trim();
  if (!recipient) throw Object.assign(new Error('ยังไม่ได้ตั้งค่าอีเมลผู้รับรายงาน'), { status: 400 });

  const { from, to: end } = dayBounds(dateStr);
  const summary = await computeDailySummary(prisma, from, end);
  const dateLabel = from.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const msg = buildDailySummaryEmail({ dateLabel, storeName: setting.storeName, currency: setting.currency, summary });
  await sendMail(
    { smtpHost: setting.smtpHost, smtpPort: setting.smtpPort, smtpSecure: setting.smtpSecure, smtpUser: setting.smtpUser, smtpPass: setting.smtpPass, smtpFrom: setting.smtpFrom, storeName: setting.storeName },
    { to: recipient, ...msg }
  );
  return { to: recipient, orders: summary.orders };
}

/**
 * Start the in-process daily-report scheduler. Every minute it checks whether the
 * configured send hour has arrived and the prior day's summary hasn't been sent;
 * if so it emails yesterday's summary and records the send date. Best-effort — a
 * send failure is logged and retried on the next tick (lastSent isn't advanced).
 */
export function startReportScheduler(prisma: PrismaClient): NodeJS.Timeout {
  const tick = async () => {
    try {
      const s = await prisma.setting.findUnique({ where: { id: 1 } });
      if (!s) return;
      const now = new Date();
      const today = localDateStr(now);
      if (!shouldSendDailyReport(s, now, today)) return;
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
      await sendDailyReport(prisma, localDateStr(yesterday));
      await prisma.setting.update({ where: { id: 1 }, data: { reportEmailLastSent: today } });
      console.log(`\x1b[32m✓ Daily sales report emailed to ${s.reportEmailTo}\x1b[0m`);
    } catch (e) {
      console.error('Daily report scheduler:', (e as Error).message);
    }
  };
  return setInterval(tick, 60_000);
}
