import nodemailer from 'nodemailer';

export interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  storeName: string;
}

export function isSmtpConfigured(c: Pick<SmtpConfig, 'smtpHost'>): boolean {
  return !!c.smtpHost?.trim();
}

/**
 * Send an email via the store's configured SMTP server. Throws a 400-tagged error
 * when SMTP isn't configured. The transport is built per-send (settings can change
 * at runtime and sends are infrequent).
 */
export async function sendMail(
  c: SmtpConfig,
  msg: { to: string; subject: string; html: string; text: string }
): Promise<{ messageId: string }> {
  if (!isSmtpConfigured(c)) {
    throw Object.assign(new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์อีเมล (SMTP) ในหน้าตั้งค่า'), { status: 400 });
  }
  const transport = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort || 587,
    secure: !!c.smtpSecure,
    auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
  });
  const from = c.smtpFrom?.trim() || (c.smtpUser ? `${c.storeName} <${c.smtpUser}>` : c.storeName);
  const info = await transport.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  return { messageId: info.messageId };
}
