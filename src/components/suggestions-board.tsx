"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Comment = { id: string; body: string; author_name: string; is_staff_reply: number; created_at: string };
type Suggestion = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  staff_note: string | null;
  author_name: string;
  score: number;
  upvotes: number;
  downvotes: number;
  viewer_vote: number;
  comment_count: number;
  created_at: string;
  is_locked: number;
  comments: Comment[];
};

const statuses = ["NEW", "UNDER_REVIEW", "NEEDS_INFO", "PLANNED", "IN_DEVELOPMENT", "RELEASED", "DECLINED", "DUPLICATE"] as const;

export function SuggestionsBoard({ suggestions, canManage }: { suggestions: Suggestion[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function createSuggestion(formData: FormData) {
    setBusy("create"); setMessage("");
    try {
      const response = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: formData.get("title"), description: formData.get("description"), category: formData.get("category"), scopeType: "PLATFORM" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Suggestion could not be submitted.");
      setMessage("Suggestion submitted."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Suggestion could not be submitted."); }
    finally { setBusy(null); }
  }

  async function vote(id: string, value: -1 | 0 | 1) {
    setBusy(`vote-${id}`); setMessage("");
    try {
      const response = await fetch(`/api/suggestions/${id}/vote`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote: value }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Vote could not be saved.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vote could not be saved."); }
    finally { setBusy(null); }
  }

  async function comment(id: string, formData: FormData) {
    setBusy(`comment-${id}`); setMessage("");
    try {
      const response = await fetch(`/api/suggestions/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: formData.get("body") }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Comment could not be posted.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Comment could not be posted."); }
    finally { setBusy(null); }
  }

  async function updateStatus(id: string, formData: FormData) {
    setBusy(`status-${id}`); setMessage("");
    try {
      const response = await fetch(`/api/suggestions/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: formData.get("status"), staffNote: formData.get("staffNote"), locked: formData.get("locked") === "on" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Suggestion status could not be changed.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Suggestion status could not be changed."); }
    finally { setBusy(null); }
  }

  return (
    <div className="section-stack">
      <form className="panel section-stack" action={createSuggestion}>
        <div className="section-header"><div><h2>Submit a suggestion</h2><p>Share an idea for events, teams, profiles, Discord integration, mobile support, or tools.</p></div></div>
        <div className="two-column"><div className="form-stack compact"><label htmlFor="suggestion-title">Title</label><input id="suggestion-title" name="title" minLength={5} maxLength={160} required /></div><div className="form-stack compact"><label htmlFor="suggestion-category">Category</label><select id="suggestion-category" name="category" defaultValue="OTHER"><option value="EVENTS">Events</option><option value="BRACKETS">Brackets</option><option value="TEAMS">Teams</option><option value="PROFILES">Profiles</option><option value="MOBILE">Mobile</option><option value="DISCORD">Discord</option><option value="TOOLS">Tools</option><option value="OTHER">Other</option></select></div></div>
        <div className="form-stack compact"><label htmlFor="suggestion-description">Description</label><textarea id="suggestion-description" name="description" rows={5} minLength={10} maxLength={5000} required /></div>
        <button className="button" type="submit" disabled={busy === "create"}>{busy === "create" ? "Submitting…" : "Submit suggestion"}</button>
      </form>

      <section className="suggestion-list">
        {suggestions.length ? suggestions.map((suggestion) => (
          <article className="panel suggestion-card" key={suggestion.id}>
            <div className="suggestion-votes">
              <button className={suggestion.viewer_vote === 1 ? "active" : ""} type="button" onClick={() => vote(suggestion.id, suggestion.viewer_vote === 1 ? 0 : 1)} disabled={busy === `vote-${suggestion.id}`} aria-label="Upvote">▲</button>
              <strong>{suggestion.score}</strong>
              <button className={suggestion.viewer_vote === -1 ? "active danger" : "danger"} type="button" onClick={() => vote(suggestion.id, suggestion.viewer_vote === -1 ? 0 : -1)} disabled={busy === `vote-${suggestion.id}`} aria-label="Downvote">▼</button>
            </div>
            <div className="suggestion-content">
              <div className="suggestion-meta"><span className="badge">{suggestion.status.replaceAll("_", " ")}</span><span className="badge">{suggestion.category}</span><span>{suggestion.upvotes} up · {suggestion.downvotes} down</span></div>
              <h2>{suggestion.title}</h2><p>{suggestion.description}</p><small className="muted">Suggested by {suggestion.author_name} · {new Date(suggestion.created_at).toLocaleDateString()}</small>
              {suggestion.staff_note ? <div className="staff-note"><strong>Staff update</strong><p>{suggestion.staff_note}</p></div> : null}
              <details className="comment-panel"><summary>{suggestion.comment_count} comment{suggestion.comment_count === 1 ? "" : "s"}</summary><div className="comment-list">{suggestion.comments.map((item) => <div className={`comment${item.is_staff_reply ? " staff-comment" : ""}`} key={item.id}><strong>{item.author_name}{item.is_staff_reply ? " · Staff" : ""}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>)}</div>{suggestion.is_locked ? <p className="muted">Comments are locked.</p> : <form className="inline-form" action={(formData) => comment(suggestion.id, formData)}><input name="body" placeholder="Add a comment" minLength={2} maxLength={2000} required /><button className="button button-secondary" disabled={busy === `comment-${suggestion.id}`}>Reply</button></form>}</details>
              {canManage ? <form className="staff-control-row" action={(formData) => updateStatus(suggestion.id, formData)}><select name="status" defaultValue={suggestion.status}>{statuses.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select><input name="staffNote" defaultValue={suggestion.staff_note ?? ""} placeholder="Staff note" /><label className="checkbox-row"><input type="checkbox" name="locked" defaultChecked={Boolean(suggestion.is_locked)} />Lock</label><button className="button button-secondary" disabled={busy === `status-${suggestion.id}`}>Update</button></form> : null}
            </div>
          </article>
        )) : <div className="empty-state">No suggestions have been submitted yet.</div>}
      </section>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
