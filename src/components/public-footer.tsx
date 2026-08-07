import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <strong>Game Night Tools</strong>
        <span>Discord-connected tools for community events, teams, tournaments, and server management.</span>
      </div>
      <nav aria-label="Site information">
        <Link href="/help">Help & walkthrough</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
    </footer>
  );
}
