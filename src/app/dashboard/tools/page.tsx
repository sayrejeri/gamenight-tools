import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { AnnouncementBuilder, CountdownTool, MapPickerTool, MatchupTool, RandomTeamTool } from "@/components/community-tools";

export default async function ToolsPage() {
  await requireSession();

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Host utilities</span>
          <h1>Game Night Tools</h1>
          <p>Build tournaments, run live score and timer controls, save reusable game pools, and make quick random picks without leaving the host dashboard.</p>
        </div>
        <div className="button-row"><Link className="button" href="/dashboard/tools/studio">Open live studio</Link><Link className="button button-secondary" href="/dashboard/tools/pools">Saved pools</Link></div>
      </section>

      <div className="tool-feature-grid">
        <section className="tool-feature-card">
          <div><span className="card-kicker">Live host screen</span><h2>Game Night Studio</h2><p>Scoreboard, countdown or stopwatch timer, player picker, random teams, and saved pool picks in one live control screen.</p></div>
          <Link className="button" href="/dashboard/tools/studio">Open studio</Link>
        </section>
        <section className="tool-feature-card">
          <div><span className="card-kicker">Reusable library</span><h2>Saved game & map pools</h2><p>Save your usual games, maps, modes, and challenges, then pick through them without repeats.</p></div>
          <Link className="button" href="/dashboard/tools/pools">Manage pools</Link>
        </section>
        <section className="tool-feature-card">
          <div><span className="card-kicker">Tournament builder</span><h2>Bracket generator</h2><p>Single elimination, double elimination, round robin, groups-to-playoffs, team tournaments, and the custom three-player format.</p></div>
          <Link className="button" href="/dashboard/tools/bracket">Build a competition</Link>
        </section>
      </div>

      <section className="panel section-stack"><div><span className="eyebrow">Quick utilities</span><h2>Grab-and-go tools</h2><p className="muted">The original quick tools still work when you do not need the full studio.</p></div><div className="tools-columns"><div className="tools-column"><RandomTeamTool /><MapPickerTool /><CountdownTool /></div><div className="tools-column"><MatchupTool /><AnnouncementBuilder /></div></div></section>
    </div>
  );
}
