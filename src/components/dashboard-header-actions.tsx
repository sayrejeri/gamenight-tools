"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";

const primaryLinks = [
  ["Home", "/dashboard"], ["Events", "/dashboard/events"], ["Servers", "/dashboard/servers"],
  ["Teams", "/dashboard/teams"], ["Suggestions", "/dashboard/suggestions"], ["Tools", "/dashboard/tools"], ["Search", "/dashboard/search"],
] as const;

type OpenMenu = "profile" | "navigation" | null;

export function DashboardHeaderActions({ avatarUrl, displayName, siteUsername, fallbackUsername, unread, platformRole }: {
  avatarUrl: string | null; displayName: string; siteUsername: string | null; fallbackUsername: string; unread: number; platformRole: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const publicUsername = siteUsername ?? fallbackUsername;

  useEffect(() => { setOpenMenu(null); }, [pathname]);
  useEffect(() => {
    if (!openMenu) return;
    function handlePointerDown(event: PointerEvent) { const target = event.target; if (target instanceof Node && !rootRef.current?.contains(target)) setOpenMenu(null); }
    function handleKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setOpenMenu(null); }
    document.addEventListener("pointerdown", handlePointerDown); document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("pointerdown", handlePointerDown); document.removeEventListener("keydown", handleKeyDown); };
  }, [openMenu]);

  function toggle(menu: Exclude<OpenMenu, null>) { setOpenMenu((current) => current === menu ? null : menu); }
  function closeMenus() { setOpenMenu(null); }
  function handleNotificationsClick(event: MouseEvent<HTMLAnchorElement>) {
    closeMenus(); event.preventDefault();
    if (pathname === "/dashboard/notifications") {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      const isDashboardPath = returnTo === "/dashboard" || returnTo?.startsWith("/dashboard/");
      const isNotificationsPath = returnTo?.startsWith("/dashboard/notifications");
      router.push(returnTo && isDashboardPath && !isNotificationsPath ? returnTo : "/dashboard"); return;
    }
    const currentDashboardPage = `${window.location.pathname}${window.location.search}`;
    router.push(`/dashboard/notifications?returnTo=${encodeURIComponent(currentDashboardPage)}`);
  }

  const avatar = avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <span className="avatar avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>;
  return (
    <div className="header-account-actions" ref={rootRef}>
      <Link className="notification-link" href="/dashboard/notifications" aria-label={pathname === "/dashboard/notifications" ? "Return to the previous dashboard page" : `${unread} unread notifications`} title={pathname === "/dashboard/notifications" ? "Return to previous page" : "Notifications"} onClick={handleNotificationsClick}>
        <span className="notification-symbol" aria-hidden="true">🔔</span>{unread ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
      </Link>

      <details className="profile-menu" open={openMenu === "profile"}>
        <summary aria-label="Open profile menu" aria-expanded={openMenu === "profile"} onClick={(event) => { event.preventDefault(); toggle("profile"); }}>
          {avatar}<span><strong>{displayName}</strong><small>@{publicUsername}</small></span>
        </summary>
        {openMenu === "profile" ? <button className="mobile-menu-backdrop" type="button" aria-label="Close profile menu" onClick={closeMenus} /> : null}
        <div className="profile-menu-popover">
          <div className="profile-menu-user">{avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <span className="avatar avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}<div><strong>{displayName}</strong><small>@{publicUsername}</small></div></div>
          {siteUsername ? <Link href={`/users/${siteUsername}`} onClick={closeMenus}>My profile</Link> : null}
          <Link href="/dashboard/profile" onClick={closeMenus}>Game identities</Link>
          <Link href="/dashboard/access" onClick={closeMenus}>Access Center</Link>
          <Link href="/dashboard/settings" onClick={closeMenus}>Settings</Link>
          <Link href="/dashboard/profile-requests" onClick={closeMenus}>Profile requests</Link>
          <Link href="/help" onClick={closeMenus}>Help & walkthrough</Link>
          {platformRole ? <Link href="/dashboard/staff" onClick={closeMenus}>Staff dashboard <span className="badge">{platformRole}</span></Link> : null}
          <SignOutButton />
        </div>
      </details>

      <details className="mobile-navigation" open={openMenu === "navigation"}>
        <summary aria-label="Open navigation menu" aria-expanded={openMenu === "navigation"} onClick={(event) => { event.preventDefault(); toggle("navigation"); }}><span className="hamburger-lines" aria-hidden="true"><i /><i /><i /></span></summary>
        {openMenu === "navigation" ? <button className="mobile-menu-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMenus} /> : null}
        <div className="mobile-navigation-panel"><div className="mobile-navigation-heading"><strong>Navigate</strong><small>Game Night Tools</small></div><nav aria-label="Mobile dashboard navigation">{primaryLinks.map(([label, href]) => <Link href={href} key={href} onClick={closeMenus}>{label}<span aria-hidden="true">›</span></Link>)}</nav></div>
      </details>
    </div>
  );
}
