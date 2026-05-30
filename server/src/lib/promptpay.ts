/**
 * PromptPay EMVCo QR payload generator (self-contained — no external deps).
 *
 * Builds the standard Thai PromptPay "dynamic" QR string encoding the
 * destination PromptPay ID and the exact transaction amount, then appends a
 * CRC16-CCITT (0xFFFF) checksum. The resulting string is rendered as a QR by
 * the frontend and is scannable by any Thai mobile banking app.
 *
 * Reference: EMVCo Merchant-Presented QR + Bank of Thailand PromptPay spec.
 */

export type PromptPayType = 'MSISDN' | 'NATID' | 'EWALLET';

const AID_PROMPTPAY = 'A000000677010111';

/** Encode one EMVCo TLV field: 2-digit id + 2-digit length + value. */
function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/** CRC16-CCITT (False): poly 0x1021, init 0xFFFF. Returns 4 hex chars upper. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Normalise the target into the format PromptPay expects inside tag 29. */
function formatTarget(id: string, type: PromptPayType): { tag: string; value: string } {
  const digits = id.replace(/[^0-9]/g, '');
  if (type === 'NATID' || digits.length === 13) {
    // National ID / Tax ID — 13 digits, sub-tag 02
    return { tag: '02', value: digits };
  }
  if (type === 'EWALLET' || digits.length === 15) {
    return { tag: '03', value: digits };
  }
  // Mobile number — sub-tag 01, formatted as 0066xxxxxxxxx (drop leading 0).
  const local = digits.replace(/^0/, '');
  return { tag: '01', value: `0066${local}` };
}

export interface PromptPayInput {
  id: string;
  type?: PromptPayType;
  amount?: number; // THB; omit for a static (amount-less) QR
}

export function buildPromptPayPayload({ id, type = 'MSISDN', amount }: PromptPayInput): string {
  if (!id) throw new Error('PromptPay ID is not configured');

  const target = formatTarget(id, type);
  const merchantAccount = tlv('29', tlv('00', AID_PROMPTPAY) + tlv(target.tag, target.value));

  // 01: payload format indicator. 11=static, 12=dynamic (has amount).
  const poiMethod = amount != null ? '12' : '11';

  // Canonical EMVCo / PromptPay tag order: 00,01,29,53,54,58,63.
  let payload =
    tlv('00', '01') +
    tlv('01', poiMethod) +
    merchantAccount +
    tlv('53', '764'); // currency THB

  if (amount != null) {
    payload += tlv('54', amount.toFixed(2)); // amount before country
  }

  payload += tlv('58', 'TH'); // country

  // CRC field id 63 + length 04, checksum computed over everything incl. "6304".
  const toCheck = payload + '6304';
  return toCheck + crc16(toCheck);
}
