import Link from "next/link";

export function BrandMark({ href = "/dashboard", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link className={`brand-lockup${compact ? " brand-lockup-compact" : ""}`} href={href} aria-label="Game Night Tools">
      <span className="brand-icon" aria-hidden="true"><span>G</span><i>NT</i></span>
      {compact ? null : <span className="brand-copy"><strong>Game Night Tools</strong><small>Events · Teams · Community</small></span>}
    </Link>
  );
}
