import { useEffect, useRef } from 'react';

/**
 * Global barcode/QR scanner auto-listen.
 *
 * Hardware scanners act as keyboards: they "type" the code very fast and end
 * with Enter. We buffer keystrokes and treat a burst (inter-key gap below
 * `maxGapMs`) terminated by Enter as a scan, distinguishing it from a human
 * typing. The listener stays attached for the lifetime of the component so the
 * cashier never has to focus a field — they just scan.
 *
 * Manual typing into an <input>/<textarea> is ignored unless that input opts in
 * with `data-scan="true"`, so search boxes keep working normally.
 */
export function useScanner(onScan: (code: string) => void, opts: { maxGapMs?: number; minLength?: number } = {}) {
  const { maxGapMs = 35, minLength = 3 } = opts;
  const buffer = useRef('');
  const lastTime = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const optedIn = target?.getAttribute?.('data-scan') === 'true';
      // Allow scanning while focused on a scan-enabled field, otherwise skip fields.
      if (inField && !optedIn) return;

      const now = e.timeStamp;
      const gap = now - lastTime.current;

      if (e.key === 'Enter') {
        const code = buffer.current.trim();
        buffer.current = '';
        if (code.length >= minLength) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      // A single printable character.
      if (e.key.length === 1) {
        // Reset buffer if too much time passed since the last key (human typing).
        if (gap > maxGapMs) buffer.current = '';
        buffer.current += e.key;
        lastTime.current = now;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [maxGapMs, minLength]);
}
