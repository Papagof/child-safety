import { useEffect, useState } from "react";
import { getSignedPhotoUrl } from "../lib/data";

export function Avatar({ src, name, size = 48 }: { src?: string | null; name: string; size?: number }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  // photo_url columns store a path into the private `photos` bucket (e.g.
  // "children/{id}/uuid.jpg"), not a fetchable URL — the bucket stays private
  // per spec.md §6's data-minimization note, so every render resolves a
  // short-lived signed URL instead.
  useEffect(() => {
    if (!src) {
      setResolvedUrl(null);
      return;
    }
    if (/^https?:\/\//.test(src)) {
      setResolvedUrl(src);
      return;
    }
    let cancelled = false;
    getSignedPhotoUrl(src)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover border border-slate-200 shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold border border-slate-200 shrink-0"
    >
      {initials || "?"}
    </div>
  );
}
