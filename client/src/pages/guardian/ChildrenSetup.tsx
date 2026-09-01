import { useEffect, useState } from "react";
import {
  addPickupPerson,
  archiveChild,
  createChild,
  listRooms,
  myChildren,
  myPickupPeople,
  uploadChildPhoto as uploadChildPhotoToStorage,
  uploadPickupPersonPhoto as uploadPickupPersonPhotoToStorage,
} from "../../lib/data";
import { updatePickupPerson } from "../../lib/rpc";
import type { Child, PickupPerson, Room } from "../../lib/types";
import { Avatar } from "../../components/Avatar";

function PhotoUpload({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="text-xs text-brand-700 font-medium cursor-pointer">
      {busy ? "Uploading…" : "Upload photo"}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            await onUpload(file);
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

function PickupPeopleList({ childId }: { childId: string }) {
  const [people, setPeople] = useState<PickupPerson[]>([]);
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [idReference, setIdReference] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setPeople(await myPickupPeople(childId));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function addPerson() {
    if (!fullName || !relationship) return;
    await addPickupPerson(childId, { fullName, relationship, idReference });
    setFullName("");
    setRelationship("");
    setIdReference("");
    setShowForm(false);
    load();
  }

  async function setStatus(id: string, status: "active" | "inactive" | "blocked") {
    let blockedReason: string | undefined;
    if (status === "blocked") {
      blockedReason = window.prompt("Reason this person is explicitly not authorized (shown to staff):") ?? undefined;
    }
    await updatePickupPerson(id, { status, blockedReason });
    load();
  }

  async function uploadPhoto(id: string, file: File) {
    await uploadPickupPersonPhotoToStorage(id, file);
    load();
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Authorized pickup people</p>
      {people.length === 0 && <p className="text-sm text-slate-400">Only you can pick up this child so far.</p>}
      {people.map((p) => (
        <div key={p.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2">
          <Avatar src={p.photoUrl} name={p.fullName} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {p.fullName} <span className="text-slate-400 font-normal">· {p.relationship}</span>
            </p>
            <p
              className={`text-xs ${
                p.status === "blocked" ? "text-red-600 font-semibold" : p.status === "active" ? "text-emerald-600" : "text-slate-400"
              }`}
            >
              {p.status === "blocked" ? `Blocked — ${p.blockedReason ?? "not authorized"}` : p.status}
            </p>
          </div>
          <PhotoUpload onUpload={(file) => uploadPhoto(p.id, file)} />
          <select
            value={p.status}
            onChange={(e) => setStatus(p.id, e.target.value as any)}
            className="text-xs border border-slate-300 rounded-md px-1.5 py-1"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      ))}

      {showForm ? (
        <div className="space-y-2 bg-slate-50 rounded-lg p-3">
          <input
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <input
            placeholder="Relationship (e.g. Grandmother)"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <input
            placeholder="ID reference (optional)"
            value={idReference}
            onChange={(e) => setIdReference(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={addPerson} className="bg-brand-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
              Add
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="text-xs font-medium text-brand-700">
          + Add authorized pickup person
        </button>
      )}
    </div>
  );
}

export default function ChildrenSetup() {
  const [children, setChildren] = useState<Child[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [defaultRoomId, setDefaultRoomId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const [c, r] = await Promise.all([myChildren(), listRooms()]);
    setChildren(c);
    setRooms(r);
  }

  useEffect(() => {
    load();
  }, []);

  async function addChild() {
    if (!fullName || !dob) return;
    await createChild({ fullName, dob, medicalNotes, defaultRoomId: defaultRoomId || undefined });
    setFullName("");
    setDob("");
    setMedicalNotes("");
    setShowAdd(false);
    load();
  }

  async function uploadChildPhoto(id: string, file: File) {
    await uploadChildPhotoToStorage(id, file);
    load();
  }

  // Soft-delete (spec.md §6): hides the child from this list without
  // touching session/audit history — see archiveChild() in lib/data.ts.
  async function removeChild(id: string, name: string) {
    if (!window.confirm(`Remove ${name}? This hides them from your account — past check-in records are kept for safety accountability.`)) return;
    await archiveChild(id);
    load();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Children &amp; pickup list</h1>

      {children.map((child) => (
        <div key={child.id} className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Avatar src={child.photoUrl} name={child.fullName} size={48} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800">{child.fullName}</p>
              <p className="text-sm text-slate-500">{child.age} years old</p>
            </div>
            <PhotoUpload onUpload={(file) => uploadChildPhoto(child.id, file)} />
            <button
              onClick={() => setExpanded(expanded === child.id ? null : child.id)}
              className="text-sm text-brand-700 font-medium"
            >
              {expanded === child.id ? "Hide" : "Manage"}
            </button>
          </div>
          {expanded === child.id && (
            <>
              {child.medicalNotes && (
                <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                  Medical/allergy notes: {child.medicalNotes}
                </p>
              )}
              <PickupPeopleList childId={child.id} />
              <button onClick={() => removeChild(child.id, child.fullName)} className="mt-3 text-xs text-red-600 font-medium">
                Remove child
              </button>
            </>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <input
            placeholder="Child's full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={defaultRoomId}
            onChange={(e) => setDefaultRoomId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Auto-suggest room by age</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Medical/allergy notes (optional — only visible to assigned staff)"
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={addChild} className="bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">
              Save child
            </button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full border-2 border-dashed border-slate-300 rounded-2xl py-4 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-700"
        >
          + Add a child
        </button>
      )}
    </div>
  );
}
