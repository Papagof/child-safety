import { useEffect, useState } from "react";
import { listOrganizationsForDeveloper, setOrganizationActive, type DeveloperOrg } from "../../lib/rpc";

export default function Developer() {
  const [orgs, setOrgs] = useState<DeveloperOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setOrgs(await listOrganizationsForDeveloper());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(org: DeveloperOrg) {
    if (
      org.active &&
      !window.confirm(
        `Deactivate ${org.name}? Every guardian, staff, and admin there loses access immediately, until you reactivate it.`
      )
    ) {
      return;
    }
    setBusyId(org.id);
    try {
      await setOrganizationActive(org.id, !org.active);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const totalChildren = orgs.reduce((sum, o) => sum + o.childrenCount, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Churches</h1>
        <p className="text-sm text-slate-500">
          {orgs.length} {orgs.length === 1 ? "church" : "churches"} · {totalChildren}{" "}
          {totalChildren === 1 ? "child" : "children"} total across the platform
        </p>
      </div>

      {orgs.length === 0 && <p className="text-slate-400">No churches yet.</p>}

      {orgs.map((org) => (
        <div key={org.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{org.name}</p>
            <p className="text-sm text-slate-500">
              {org.childrenCount} {org.childrenCount === 1 ? "child" : "children"} · joined{" "}
              {new Date(org.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
              org.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
            }`}
          >
            {org.active ? "Active" : "Deactivated"}
          </span>
          <button
            disabled={busyId === org.id}
            onClick={() => toggle(org)}
            className={`text-xs font-semibold rounded-lg px-3 py-1.5 shrink-0 disabled:opacity-50 ${
              org.active
                ? "bg-red-100 hover:bg-red-200 text-red-700"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {busyId === org.id ? "…" : org.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      ))}
    </div>
  );
}
