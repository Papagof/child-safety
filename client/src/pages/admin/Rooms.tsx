import { useEffect, useState } from "react";
import { createRoom, listRooms, setRoomActive, updateRoom } from "../../lib/data";
import type { Room } from "../../lib/types";

function EditRoomForm({ room, onSaved, onCancel }: { room: Room; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(room.name);
  const [ageMin, setAgeMin] = useState(room.ageMin);
  const [ageMax, setAgeMax] = useState(room.ageMax);
  const [capacity, setCapacity] = useState(room.capacity);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateRoom(room.id, { name, ageMin, ageMax, capacity });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} placeholder="Min age" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="number" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} placeholder="Max age" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} placeholder="Capacity" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="text-xs text-slate-500">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState("");
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(12);
  const [capacity, setCapacity] = useState(20);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setRooms(await listRooms());
  }

  useEffect(() => {
    load();
  }, []);

  async function addRoom() {
    if (!name) return;
    await createRoom({ name, ageMin, ageMax, capacity });
    setName("");
    load();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Rooms &amp; classes</h1>
      <div className="grid gap-2">
        {rooms.map((r) =>
          editingId === r.id ? (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3">
              <EditRoomForm
                room={r}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
              />
            </div>
          ) : (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{r.name}</p>
                <p className="text-xs text-slate-500">
                  Ages {r.ageMin}-{r.ageMax} · capacity {r.capacity}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditingId(r.id)} className="text-xs font-medium text-brand-700">
                  Edit
                </button>
                <button
                  onClick={async () => {
                    await setRoomActive(r.id, !r.active);
                    load();
                  }}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    r.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {r.active ? "Active" : "Inactive"}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-slate-700">Add a room</p>
        <input
          placeholder="Room name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            value={ageMin}
            onChange={(e) => setAgeMin(Number(e.target.value))}
            placeholder="Min age"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={ageMax}
            onChange={(e) => setAgeMax(Number(e.target.value))}
            placeholder="Max age"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            placeholder="Capacity"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button onClick={addRoom} className="bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-semibold">
          Add room
        </button>
      </div>
    </div>
  );
}
