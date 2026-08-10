import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { GameNightStudio } from "@/components/game-night-studio";

export default async function GameNightStudioPage() {
  await requireSession();
  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Host live control</span><h1>Game Night Studio</h1><p>Run a scoreboard, timer, player picker, random teams, and saved game/map pools from one screen.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/tools">Back to tools</Link><Link className="button" href="/dashboard/tools/pools">Saved pools</Link></div>
      </section>
      <GameNightStudio />
    </div>
  );
}
