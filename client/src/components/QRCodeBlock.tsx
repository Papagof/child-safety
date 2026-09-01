import { QRCodeSVG } from "qrcode.react";

export function QRCodeBlock({ code, label, sessionId }: { code: string; label: string; sessionId: string }) {
  return (
    <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl border border-slate-200">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="p-3 bg-white border border-slate-100 rounded-xl">
        <QRCodeSVG value={`SHMEERA:${sessionId}:${code}`} size={160} />
      </div>
      <p className="text-3xl font-bold tracking-[0.3em] text-brand-800">{code}</p>
      <p className="text-xs text-slate-400 text-center max-w-[220px]">
        Show this screen to staff, or let them scan the QR. It also works printed as a paper backup.
      </p>
    </div>
  );
}
