import { api } from '../api/client';
import { toast } from '../components/Toast';
import type { Sale, Setting } from '../types';

/**
 * Route a receipt to the right destination based on settings:
 * - ESCPOS_NET → send to the network thermal printer via the backend.
 * - otherwise  → fall back to the browser print dialog (the provided callback).
 */
export async function printReceipt(sale: Sale, setting: Setting | null, browserFallback: () => void) {
  if (setting?.printerType === 'ESCPOS_NET') {
    try {
      await api(`/print/receipt/${sale.id}`, { method: 'POST' });
      toast.success('ส่งใบเสร็จไปยังเครื่องพิมพ์แล้ว');
    } catch (e) {
      toast.error((e as Error).message);
    }
    return;
  }
  browserFallback();
}
