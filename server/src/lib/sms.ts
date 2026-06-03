// Outgoing SMS via a generic JSON HTTP gateway: we POST { to, message, sender? } to the
// configured endpoint with an optional bearer token. Point it at your SMS provider's API or
// a tiny relay that adapts the payload. Mirrors lib/mailer.ts (built per-send; 400 when off).

export interface SmsConfig {
  smsApiUrl: string;
  smsApiKey: string;
  smsSender: string;
}

export function isSmsConfigured(c: Pick<SmsConfig, 'smsApiUrl'>): boolean {
  return !!c.smsApiUrl?.trim();
}

export async function sendSms(c: SmsConfig, msg: { to: string; message: string }): Promise<{ ok: true }> {
  if (!isSmsConfigured(c)) {
    throw Object.assign(new Error('ยังไม่ได้ตั้งค่าเกตเวย์ SMS ในหน้าตั้งค่า'), { status: 400 });
  }
  let res: Response;
  try {
    res = await fetch(c.smsApiUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(c.smsApiKey ? { Authorization: `Bearer ${c.smsApiKey}` } : {}) },
      body: JSON.stringify({ to: msg.to, message: msg.message, ...(c.smsSender ? { sender: c.smsSender } : {}) }),
    });
  } catch (e) {
    throw Object.assign(new Error(`ส่ง SMS ไม่สำเร็จ: ${(e as Error).message}`), { status: 502 });
  }
  if (!res.ok) throw Object.assign(new Error(`เกตเวย์ SMS ตอบกลับสถานะ ${res.status}`), { status: 502 });
  return { ok: true };
}
