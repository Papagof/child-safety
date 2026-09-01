import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "click"] as const;

// spec.md §6: "Staff-side sessions should auto-lock after inactivity so a
// left-open tablet can't be used to fraudulently approve a pickup." Simplest
// robust implementation: sign out after 5 idle minutes (rather than a lock
// screen requiring re-auth without navigating away) — fully satisfies the
// safety intent with far less to get subtly wrong.
export function useIdleLock(active: boolean, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), IDLE_TIMEOUT_MS);
    };

    reset();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset);

    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset);
    };
  }, [active]);
}
