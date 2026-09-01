import { useEffect, useRef, useState } from "react";
import { getThreadMessages, markThreadRead, postChatMessage } from "../lib/rpc";
import { getThreadId } from "../lib/data";
import { useChannel } from "../lib/useRealtime";
import { useAuth } from "../context/AuthContext";
import type { ChatMessage } from "../lib/types";

const QUICK_ALERTS = ["Needs a diaper change", "Feeling unwell", "Please come to the room"];

export function ChatPanel({ sessionId, showQuickAlerts }: { sessionId: string; showQuickAlerts: boolean }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const tid = await getThreadId(sessionId);
      if (!tid) return;
      const msgs = await getThreadMessages(sessionId);
      setThreadId(tid);
      setMessages(msgs);
      await markThreadRead(sessionId);
    } catch {
      // thread may not exist yet (before check-in acceptance)
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useChannel(threadId ? `thread:${threadId}` : null, (payload: any) => {
    if (payload.type === "chat_message") {
      setMessages((prev) => [...prev, payload.message]);
      markThreadRead(sessionId).catch(() => {});
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(body: string, isUrgent: boolean) {
    if (!body.trim()) return;
    await postChatMessage(sessionId, body, isUrgent);
    setText("");
    setUrgent(false);
    load();
  }

  if (!threadId) {
    return <p className="text-sm text-slate-400">Chat opens once the child is checked in.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border border-slate-200 rounded-xl bg-white p-3 h-64 overflow-y-auto flex flex-col gap-2">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          return (
            <div key={m.id} className={`max-w-[80%] ${mine ? "self-end text-right" : "self-start"}`}>
              <div
                className={`inline-block rounded-2xl px-3 py-2 text-sm ${
                  m.urgent
                    ? "bg-urgent-50 border border-urgent-500 text-urgent-600 font-medium"
                    : mine
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {!!m.urgent && <span className="block text-[10px] uppercase tracking-wide mb-0.5">Urgent</span>}
                {m.body}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 capitalize">
                {m.senderRole} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {showQuickAlerts && (
        <div className="flex flex-wrap gap-2">
          {QUICK_ALERTS.map((a) => (
            <button
              key={a}
              onClick={() => send(a, true)}
              className="text-xs font-medium bg-urgent-50 text-urgent-600 border border-urgent-500/40 rounded-full px-3 py-1.5 hover:bg-urgent-50/80"
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(text, urgent)}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-slate-500 select-none">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent
        </label>
        <button
          onClick={() => send(text, urgent)}
          className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Send
        </button>
      </div>
    </div>
  );
}
