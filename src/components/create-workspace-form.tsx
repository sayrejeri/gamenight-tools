"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");

    const ownerDiscordIds = String(formData.get("ownerDiscordIds") ?? "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: formData.get("guildId"),
          name: formData.get("name"),
          description: formData.get("description"),
          timezone: formData.get("timezone"),
          ownerDiscordIds,
        }),
      });
      const body = (await response.json()) as { error?: string; workspaceId?: string };
      if (!response.ok) throw new Error(body.error ?? "The server profile could not be created.");

      setMessage("Server profile created. Owner IDs will claim access when they log in.");
      router.push(`/dashboard/workspaces/${body.workspaceId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The server profile could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" action={submit}>
      <label htmlFor="workspace-name">Server profile name</label>
      <input id="workspace-name" name="name" required minLength={2} maxLength={120} />

      <label htmlFor="guild-id">Discord server ID</label>
      <input id="guild-id" name="guildId" required inputMode="numeric" pattern="[0-9]{15,25}" />

      <label htmlFor="owner-ids">Owner Discord IDs</label>
      <textarea
        id="owner-ids"
        name="ownerDiscordIds"
        required
        rows={4}
        placeholder="One ID per line or separated by commas"
      />

      <label htmlFor="workspace-timezone">Default timezone</label>
      <input id="workspace-timezone" name="timezone" defaultValue="America/Detroit" required />

      <label htmlFor="workspace-description">Description</label>
      <textarea id="workspace-description" name="description" rows={4} maxLength={2000} />

      <button className="button" type="submit" disabled={busy}>{busy ? "Creating…" : "Create server profile"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
