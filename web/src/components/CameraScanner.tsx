import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Camera-based barcode/QR scanner fallback for devices without a hardware
 * scanner. Calls onScan with the decoded text and stops on the first read.
 */
export function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const elId = useRef(`cam-${Math.floor(performance.now())}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(elId.current, { verbose: false } as any);
    scannerRef.current = scanner;
    let active = true;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 160 } },
        (decoded) => {
          if (!active) return;
          active = false;
          onScan(decoded);
          scanner.stop().catch(() => {});
        },
        () => {}
      )
      .catch(() => {});

    return () => {
      active = false;
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">Scan with camera</h3>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div id={elId.current} className="overflow-hidden rounded-xl bg-black" />
        <p className="mt-2 text-center text-xs text-slate-500">Point the camera at a barcode or QR code.</p>
      </div>
    </div>
  );
}
