/**
 * License verification + 14-day demo helpers.
 *
 * Online activation calls the vendor endpoint:
 *   https://ttmb-tech.com/license/api.php?product_id=<KEY>&action=verify
 * The response shape isn't strictly known, so we parse defensively (JSON or
 * text) and look for common "valid/active/success" signals.
 */

const VERIFY_BASE = 'https://ttmb-tech.com/license/api.php';
export const DEMO_DAYS = 14;

export interface VerifyResult {
  ok: boolean;
  plan?: string;
  customer?: string;
  expiresAt?: Date | null;
  message: string;
  raw: string;
}

function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return /^(1|true|valid|active|success|ok|yes)$/i.test(v.trim());
  return false;
}

export async function verifyLicense(key: string): Promise<VerifyResult> {
  const product_id = key.trim();
  if (!product_id) return { ok: false, message: 'กรุณากรอกรหัสไลเซนส์', raw: '' };

  const url = `${VERIFY_BASE}?product_id=${encodeURIComponent(product_id)}&action=verify`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* not json */ }

    if (!res.ok) return { ok: false, message: `เซิร์ฟเวอร์ไลเซนส์ตอบกลับ ${res.status}`, raw: text.slice(0, 2000) };

    if (data && typeof data === 'object') {
      const ok = truthy(data.valid ?? data.active ?? data.status ?? data.success ?? data.result);
      const expiresAt = data.expires || data.expiry || data.expires_at || data.expireDate
        ? new Date(data.expires || data.expiry || data.expires_at || data.expireDate)
        : null;
      return {
        ok,
        plan: String(data.plan || data.product || data.license_type || ''),
        customer: String(data.customer || data.name || data.owner || ''),
        expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
        message: ok ? 'เปิดใช้งานไลเซนส์สำเร็จ' : String(data.message || data.error || 'รหัสไลเซนส์ไม่ถูกต้องหรือหมดอายุ'),
        raw: text.slice(0, 2000),
      };
    }
    // Plain-text response fallback.
    const ok = truthy(text);
    return { ok, message: ok ? 'เปิดใช้งานไลเซนส์สำเร็จ' : 'รหัสไลเซนส์ไม่ถูกต้องหรือหมดอายุ', raw: text.slice(0, 2000) };
  } catch (e) {
    return { ok: false, message: `เชื่อมต่อเซิร์ฟเวอร์ไลเซนส์ไม่ได้: ${(e as Error).message}`, raw: '' };
  }
}

export interface LicenseRow {
  status: string;
  expiresAt: Date | null;
}

/** Public-facing license state, with demo/expiry resolved against `now`. */
export function computeLicenseState(lic: LicenseRow | null) {
  if (!lic) return { status: 'INACTIVE', valid: false, daysLeft: 0, expiresAt: null as Date | null };

  let status = lic.status;
  let daysLeft = 0;
  if (lic.expiresAt) {
    const ms = lic.expiresAt.getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(ms / 86_400_000));
    if (ms <= 0 && (status === 'DEMO' || status === 'ACTIVE')) status = 'EXPIRED';
  }
  const valid = status === 'ACTIVE' || status === 'DEMO';
  return { status, valid, daysLeft, expiresAt: lic.expiresAt };
}
