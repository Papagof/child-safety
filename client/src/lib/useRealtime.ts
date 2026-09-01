import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Listener = (payload: any) => void;

// The broadcast event names any RPC ever sends (see notify_session_update
// / post_chat_message / flag_pickup_mismatch / create_notification in
// supabase/migrations). A given topic only ever receives a subset of these,
// but subscribing to all of them per channel is harmless and keeps this file
// topic-agnostic — same role this module played as a raw WebSocket client
// before the migration.
const EVENT_NAMES = ["session_updated", "chat_message", "incident_created", "notification_created"] as const;

const channels = new Map<string, { channel: RealtimeChannel; listeners: Set<Listener> }>();

function getOrCreateChannel(topic: string) {
  let entry = channels.get(topic);
  if (entry) return entry;

  const listeners = new Set<Listener>();
  // private: true pairs with the Realtime Authorization policies on
  // realtime.messages (supabase/migrations/0012_realtime_authorization.sql) —
  // the subscribe call itself is rejected server-side if the signed-in user
  // isn't authorized for this topic.
  const channel = supabase.channel(topic, { config: { private: true } });
  for (const event of EVENT_NAMES) {
    channel.on("broadcast", { event }, ({ payload }) => {
      listeners.forEach((fn) => fn(payload));
    });
  }
  channel.subscribe();

  entry = { channel, listeners };
  channels.set(topic, entry);
  return entry;
}

export function subscribe(topic: string, listener: Listener) {
  const entry = getOrCreateChannel(topic);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      supabase.removeChannel(entry.channel);
      channels.delete(topic);
    }
  };
}

export function useChannel(channel: string | null | undefined, onMessage: Listener) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!channel) return;
    return subscribe(channel, (payload) => handlerRef.current(payload));
  }, [channel]);
}
