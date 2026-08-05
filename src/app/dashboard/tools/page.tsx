import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { AnnouncementBuilder, CountdownTool, MapPickerTool, MatchupTool, RandomTeamTool } from "@/components/community-tools";

export default async function ToolsPage() {
  await requireSession();
  return <div className="section-stack"><section className="page-heading"><div><span className="eyebrow">Host utilities</span><h1>Tools</h1><p>The bracket generator now lives with the rest of the event tools instead of taking a permanent spot in the main header.</p></div><Link className="button" href="/dashboard/tools/bracket">Open bracket generator</Link></section><section className="tool-feature-card"><div><span className="card-kicker">Tournament tool</span><h2>Bracket generator</h2><p>Single elimination, custom three-player advancement, manual or random placement, saved event drafts, and PNG exports.</p></div><Link className="button" href="/dashboard/tools/bracket">Build a bracket</Link></section><div className="tools-grid"><RandomTeamTool /><MatchupTool /><MapPickerTool /><AnnouncementBuilder /><CountdownTool /></div></div>;
}
