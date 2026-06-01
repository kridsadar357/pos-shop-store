import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders a CODE128 barcode as inline SVG. CODE128 encodes any SKU/EAN string and
 * scans back to the exact value, so POS lookup (by barcode or SKU) resolves it.
 */
export function Barcode({ value, height = 38, fontSize = 11, displayValue = true, width = 1.4 }: { value: string; height?: number; fontSize?: number; displayValue?: boolean; width?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height, fontSize, displayValue, margin: 0, width });
    } catch {
      /* invalid value — leave the svg empty */
    }
  }, [value, height, fontSize, displayValue, width]);
  return <svg ref={ref} aria-label={`barcode ${value}`} />;
}
