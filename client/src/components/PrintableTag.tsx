import { QRCodeSVG } from "qrcode.react";

// spec.md §3.6 / §6: a printed matching tag pair as the offline physical
// backup — one stub stays with the child, the other with the parent, both
// showing the same code/QR so pickup still works if a phone dies or the
// venue has no connectivity. @media print hides everything else on the page.
export function PrintableTag({ childName, code, sessionId, label }: { childName: string; code: string; sessionId: string; label: string }) {
  return (
    <div className="print:fixed print:inset-0 print:bg-white print:z-50 print:p-8">
      <div className="hidden print:flex print:flex-row print:gap-8 print:justify-center">
        {["Child tag", "Parent stub"].map((half) => (
          <div key={half} className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-400 rounded-xl p-6 w-64">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{half}</p>
            <p className="font-bold text-lg text-center">{childName}</p>
            <p className="text-xs text-slate-500">{label}</p>
            <QRCodeSVG value={`SHMEERA:${sessionId}:${code}`} size={140} />
            <p className="text-2xl font-bold tracking-[0.25em]">{code}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
