import { isPlatformOwner, requireSession } from "@/lib/auth";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";

export default async function ServerSetupPage() {
  const session = await requireSession();

  if (!isPlatformOwner(session.discordId)) {
    return (
      <section className="panel">
        <h1>Access denied</h1>
        <p className="muted">Only a platform owner can create a new Discord server profile.</p>
      </section>
    );
  }

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Platform administration</span>
          <h1>Create a server profile</h1>
          <p>Set the Discord server ID and the owner IDs that should receive full control after logging in.</p>
        </div>
      </section>
      <section className="panel">
        <CreateWorkspaceForm />
      </section>
    </div>
  );
}
