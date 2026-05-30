import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function QRCanvas({ value, size = 240 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M' });
    }
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} className="rounded-xl" />;
}
