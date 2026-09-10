"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/client";
import { isStaff } from "@/lib/roles";
import ThemeToggle from "./ThemeToggle";

// Sections a member can reach before their membership is approved (manual 3.7):
// Dashboard, KYC/onboarding, Profile, Notifications, Settings. The rest lock.
const ALLOWED_WHEN_PENDING = new Set(["dashboard", "kyc", "profile", "notifications", "settings"]);

// Shows the member's uploaded photo when they have one, otherwise their
// coloured initials. Keeps the same 40x40 rounded shape in every position.
function Avatar({ url, initials, title }: { url?: string | null; initials: string; title?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" title={title} className="avatar" style={{ objectFit: "cover", padding: 0 }} />;
  }
  return <div className="avatar" title={title}>{initials}</div>;
}

export default function Shell({
  profile,
  email,
  children,
}: {
  profile: any;
  email: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const sideMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const isActive = profile?.status === "active";
  let active = (pathname || "/dashboard").replace(/^\//, "") || "dashboard";
  if ((pathname || "").startsWith("/onboarding")) active = "kyc";
  const name = profile?.full_name || email || "Member";
  const initials = name.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
  const statusStr = profile?.status ? String(profile.status) : "";
  const roleLine = statusStr ? `${statusStr[0].toUpperCase()}${statusStr.slice(1)} member` : "Member";

  useEffect(() => {
    if (!userMenuOpen && !sideMenuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(t)) setUserMenuOpen(false);
      if (sideMenuOpen && sideMenuRef.current && !sideMenuRef.current.contains(t)) setSideMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        setSideMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen, sideMenuOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function hrefFor(id: string) {
    if (id === "dashboard") return "/dashboard";
    if (id === "kyc") return isActive ? "/kyc" : "/onboarding";
    return `/${id}`;
  }

  // One account menu, shared by the top-right chip and the sidebar user button,
  // so both always offer the same destinations. Header + every account
  // destination + sign out (the sidebar button used to only sign out).
  function AccountMenu({ close }: { close: () => void }) {
    const item = "nav-item";
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 8px 10px" }}>
          <Avatar url={profile?.avatar_url} initials={initials} title={name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
            <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
          </div>
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "0 4px 6px" }} />
        <Link href="/profile" role="menuitem" className={item} onClick={close}>
          <i className="fa-solid fa-user" /><span>My profile</span>
        </Link>
        <Link href="/financial-profile" role="menuitem" className={item} onClick={close}>
          <i className="fa-solid fa-heart-pulse" /><span>Financial profile</span>
        </Link>
        <Link href="/notifications" role="menuitem" className={item} onClick={close}>
          <i className="fa-solid fa-bell" /><span>Notifications</span>
        </Link>
        <Link href="/settings" role="menuitem" className={item} onClick={close}>
          <i className="fa-solid fa-gear" /><span>Settings</span>
        </Link>
        <div style={{ height: 1, background: "var(--border)", margin: "6px 4px" }} />
        <button
          role="menuitem"
          className={item}
          onClick={() => {
            close();
            signOut();
          }}
          style={{ width: "100%", background: "transparent", border: 0, cursor: "pointer", font: "inherit", color: "#ef5a5a" }}
        >
          <i className="fa-solid fa-arrow-right-from-bracket" /><span>Sign out</span>
        </button>
      </>
    );
  }

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 8px" }}>
          <div className="grad-lime" style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", color: "#20260a", fontWeight: 900, fontSize: 18 }}>A</div>
          <div><div style={{ fontWeight: 800, letterSpacing: "-.3px" }}>AWIVEST</div><div className="muted" style={{ fontSize: 11 }}>Investor Portal</div></div>
        </div>
        <nav className="side-scroll">
          {isStaff(profile?.role) && (
            <Link
              href="/staff"
              className="nav-item"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", marginBottom: 6 }}
              onClick={() => setOpen(false)}
            >
              <i className="fa-solid fa-user-shield" />
              <span>Staff console</span>
            </Link>
          )}
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((it) => {
                const locked = !isActive && !ALLOWED_WHEN_PENDING.has(it.id);
                if (locked) {
                  return (
                    <div
                      key={it.id}
                      className="nav-item"
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                      title="Available once your membership is approved"
                    >
                      <i className={`fa-solid ${it.icon}`} />
                      <span>{it.label}</span>
                      <i className="fa-solid fa-lock" style={{ marginLeft: "auto", fontSize: 11 }} />
                    </div>
                  );
                }
                return (
                  <Link
                    key={it.id}
                    href={hrefFor(it.id)}
                    className={`nav-item ${active === it.id ? "active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <i className={`fa-solid ${it.icon}`} />
                    <span>{it.label}</span>
                    {it.tag && <span className="tag">{it.tag}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
          <div ref={sideMenuRef} style={{ position: "relative" }}>
            {sideMenuOpen ? (
              <div
                role="menu"
                className="menu-pop"
                style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% + 8px)", zIndex: 90, padding: 9, boxShadow: "0 -18px 48px -18px rgba(0,0,0,0.6)" }}
              >
                <AccountMenu close={() => setSideMenuOpen(false)} />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setSideMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sideMenuOpen}
              title="Account & settings"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 8,
                width: "100%",
                textAlign: "left",
                borderRadius: 12,
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
                background: sideMenuOpen ? "var(--surface2)" : "transparent",
                border: `1px solid ${sideMenuOpen ? "var(--border)" : "transparent"}`,
                transition: ".18s",
              }}
            >
              <Avatar url={profile?.avatar_url} initials={initials} title={name} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{profile?.investor_id || "Pending ID"}</div>
              </div>
              <i
                className="fa-solid fa-chevron-up muted"
                style={{ fontSize: 11, transition: "transform .18s", transform: sideMenuOpen ? "rotate(180deg)" : "none" }}
              />
            </button>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><i className="fa-solid fa-bars" /></button>
          <label className="search"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search holdings, forms, documents…" aria-label="Search" /></label>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span className={`badge ${isActive ? "badge-good" : "badge-warn"} hide-sm`}>{profile?.status ? String(profile.status)[0].toUpperCase() + String(profile.status).slice(1) : "Member"}</span>
            <ThemeToggle />
            <button className="icon-btn" aria-label="Notifications"><i className="fa-solid fa-bell" /></button>
            <div ref={userMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: 0, cursor: "pointer", padding: 3, borderRadius: 12 }}
              >
                <Avatar url={profile?.avatar_url} initials={initials} title={name} />
                <div className="hide-sm" style={{ textAlign: "left", minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{roleLine}</div>
                </div>
                <i className="fa-solid fa-chevron-down muted hide-sm" style={{ fontSize: 11, transition: "transform .18s", transform: userMenuOpen ? "rotate(180deg)" : "none" }} />
              </button>
              {userMenuOpen ? (
                <div
                  role="menu"
                  className="menu-pop"
                  style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 248, zIndex: 90, padding: 9, boxShadow: "0 20px 48px -16px rgba(0,0,0,0.55)" }}
                >
                  <AccountMenu close={() => setUserMenuOpen(false)} />
                </div>
              ) : null}
            </div>
            <Link href="/dashboard" aria-label="AWIVEST home" style={{ display: "inline-flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/awi-logo.png" alt="AWIVEST" width={34} height={34} style={{ display: "block" }} />
            </Link>
          </div>
        </header>
        <main className="view">{children}</main>
      </div>
    </div>
  );
}
