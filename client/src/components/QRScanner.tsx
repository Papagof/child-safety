import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Parses the "SHMEERA:{sessionId}:{code}" payload QRCodeBlock/PrintableTag
// encode. Returns null for anything else (a stray QR from some other app).
export function parseScannedCode(value: string): { sessionId: string; code: string } | null {
  const parts = value.split(":");
  if (parts.length !== 3 || parts[0] !== "SHMEERA") return null;
  return { sessionId: parts[1], code: parts[2] };
}

// Camera-based scanning for the QR the guardian's screen already shows
// (QRCodeBlock/PrintableTag encode "SHMEERA:{sessionId}:{code}"). This is
// purely a faster way for staff to enter a code they'd otherwise type by
// hand — it changes nothing about the safety model: the scanned value still
// goes through the exact same accept_checkin/approve_checkout RPC call,
// which independently verifies the code server-side. Manual entry stays
// available as the fallback (poor camera, no permission, damaged screen).
export function QRScanner({ onClose, onDetect }: { onClose: () => void; onDetect: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result?.data) {
            onDetect(result.data);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
        rafId = requestAnimationFrame(tick);
      })
      .catch(() => setError("Couldn't access the camera — enter the code by hand instead."));

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-slate-700">Scan QR code</p>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-black aspect-square object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden" />
        <button onClick={onClose} className="w-full text-sm font-medium text-slate-600 border border-slate-300 rounded-lg py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
