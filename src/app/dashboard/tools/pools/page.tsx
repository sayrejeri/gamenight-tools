import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { SavedPoolManager } from "@/components/saved-pool-manager";

export default async function SavedPoolsPage() {
  await requireSession();
  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Game Night Tools</span><h1>Saved game & map pools</h1><p>Keep reusable games, maps, modes, and challenges ready for random picks without repeats.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/tools">Back to tools</Link><Link className="button" href="/dashboard/tools/studio">Open live studio</Link></div>
      </section>
      <SavedPoolManager />
    </div>
  );
}
