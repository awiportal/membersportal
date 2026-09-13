"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Inactivity auto sign-out (security hardening #179).
//
// Signs the user out after a period of no activity so an unattended session on a
// shared or public computer cannot be taken over. Kept deliberately conservative
// so it never logs out an active user:
//  - any pointer, key, touch, scroll or wheel event resets the idle clock;
//  - activity in ANY other open tab keeps this tab alive too (shared via
//    localStorage), and a sign-out in one tab is mirrored to the others;
//  - a 60s warning with a countdown is shown before the session actually ends,
//    with a "Stay signed in" button to cancel.
const IDLE_MS = 20 * 60 * 1000; // 20 minutes of inactivity -> sign out
const WARN_MS = 60 * 1000; // show the warning for the final 60 seconds
const ACTIVITY_KEY = "awivest:last-active";
const LOGOUT_KEY = "awivest:logout";

export default function IdleTimeout() {
  const router = useRouter();
  // Seconds left on the warning countdown, or null while the warning is hidden.
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());
  const throttleRef = useRef<number>(0);
  const loggingOutRef = useRef<boolean>(false);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;
    setWarnLeft(null);
    try {
      localStorage.setItem(ACTIVITY_KEY, String(now));
    } catch {
      /* private mode / storage disabled: in-memory timer still works */
    }
  }, []);

  const doLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      localStorage.setItem(LOGOUT_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* redirect regardless so the session is never left visible */
    }
    router.push("/login?reason=timeout");
    router.refresh();
  }, [router]);

  useEffect(() => {
    // Seed a fresh timestamp so a newly mounted tab is never instantly idle.
    markActive();

    const onActivity = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      lastActiveRef.current = now; // cheap in-memory update on every event
      if (now < throttleRef.current) return; // throttle the localStorage write
      throttleRef.current = now + 2000;
      setWarnLeft(null);
      try {
        localStorage.setItem(ACTIVITY_KEY, String(now));
      } catch {
        /* ignore */
      }
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) {
        const t = Number(e.newValue);
        if (!Number.isNaN(t) && t > lastActiveRef.current) {
          lastActiveRef.current = t;
          setWarnLeft(null);
        }
      } else if (e.key === LOGOUT_KEY && !loggingOutRef.current) {
        // Another tab signed out for inactivity: follow it here too.
        loggingOutRef.current = true;
        router.push("/login?reason=timeout");
        router.refresh();
      }
    };
    window.addEventListener("storage", onStorage);

    const tick = window.setInterval(() => {
      // Honour the most recent activity recorded by any open tab.
      try {
        const stored = Number(localStorage.getItem(ACTIVITY_KEY) || "0");
        if (!Number.isNaN(stored) && stored > lastActiveRef.current) lastActiveRef.current = stored;
      } catch {
        /* ignore */
      }
      const idle = Date.now() - lastActiveRef.current;
      if (idle >= IDLE_MS) {
        doLogout();
      } else if (idle >= IDLE_MS - WARN_MS) {
        setWarnLeft(Math.max(1, Math.ceil((IDLE_MS - idle) / 1000)));
      } else {
        setWarnLeft((prev) => (prev === null ? prev : null));
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
    };
  }, [markActive, doLogout, router]);

  if (warnLeft === null) return null;

  return (
    <>
      <div className="scrim" style={{ zIndex: 90 }} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-timeout-title"
        aria-describedby="idle-timeout-desc"
        style={{ position: "fixed", inset: 0, zIndex: 91, display: "grid", placeItems: "center", padding: 16 }}
      >
        <div className="card card-pad" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 26, marginBottom: 8, color: "var(--muted)" }} aria-hidden="true">
            <i className="fa-solid fa-clock-rotate-left" />
          </div>
          <h2 id="idle-timeout-title" style={{ margin: "0 0 8px", fontSize: 18 }}>
            Still there?
          </h2>
          <p id="idle-timeout-desc" style={{ margin: "0 0 18px", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            To keep your account secure, you will be signed out in{" "}
            <strong style={{ color: "var(--text)" }} aria-live="polite">
              {warnLeft}s
            </strong>{" "}
            because of inactivity.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={markActive}>
              Stay signed in
            </button>
            <button type="button" className="btn btn-ghost" onClick={doLogout}>
              Sign out now
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
