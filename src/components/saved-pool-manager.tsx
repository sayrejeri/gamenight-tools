"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PoolItem = { id: string; label: string; details: string | null };
type SavedPool = {
  id: string;
  name: string;
  poolType: "GAME" | "MAP" | "MIXED";
  createdAt: string;
  updatedAt: string;
  items: PoolItem[];
};

type Draft = { id?: string; name: string; poolType: SavedPool["poolType"]; itemsText: string };

function itemsFromText(value: string): Array<{ label: string; details?: string }> {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, ...details] = line.split("|");
    return { label: label.trim(), details: details.join("|").trim() };
  }).filter((item) => item.label);
}

function textFromPool(pool: SavedPool): string {
  return pool.items.map((item) => item.details ? `${item.label} | ${item.details}` : item.label).join("\n");
}

const emptyDraft: Draft = { name: "", poolType: "MAP", itemsText: "" };

export function SavedPoolManager() {
  const [pools, setPools] = useState<SavedPool[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pickedByPool, setPickedByPool] = useState<Record<string, string[]>>({});

  async function load() {
    const response = await fetch("/api/tools/pools", { cache: "no-store" });
    const body = await response.json() as { pools?: SavedPool[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Saved pools could not be loaded.");
    setPools(body.pools ?? []);
  }

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Saved pools could not be loaded.")); }, []);

  const itemCount = useMemo(() => itemsFromText(draft.itemsText).length, [draft.itemsText]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/tools/pools", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, name: draft.name, poolType: draft.poolType, items: itemsFromText(draft.itemsText) }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Saved pool could not be saved.");
      setDraft(emptyDraft);
      setMessage(draft.id ? "Saved pool updated." : "Saved pool created.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Saved pool could not be saved."); }
    finally { setBusy(false); }
  }

  async function remove(pool: SavedPool) {
    if (!window.confirm(`Delete “${pool.name}”?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/tools/pools", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pool.id }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Saved pool could not be deleted.");
      if (draft.id === pool.id) setDraft(emptyDraft);
      setPickedByPool((current) => { const next = { ...current }; delete next[pool.id]; return next; });
      setMessage("Saved pool deleted.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Saved pool could not be deleted."); }
    finally { setBusy(false); }
  }

  function edit(pool: SavedPool) {
    setDraft({ id: pool.id, name: pool.name, poolType: pool.poolType, itemsText: textFromPool(pool) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pick(pool: SavedPool) {
    const history = pickedByPool[pool.id] ?? [];
    let available = pool.items.filter((item) => !history.includes(item.id));
    let nextHistory = history;
    if (!available.length) {
      available = pool.items;
      nextHistory = [];
    }
    if (!available.length) return;
    const selected = available[Math.floor(Math.random() * available.length)];
    setPickedByPool((current) => ({ ...current, [pool.id]: [selected.id, ...nextHistory] }));
  }

  function selectedItem(pool: SavedPool): PoolItem | null {
    const id = pickedByPool[pool.id]?.[0];
    return pool.items.find((item) => item.id === id) ?? null;
  }

  return (
    <div className="section-stack">
      <form className="panel section-stack pool-editor" onSubmit={save}>
        <div className="section-heading-row"><div><span className="eyebrow">Reusable picker pools</span><h2>{draft.id ? "Edit saved pool" : "Create saved pool"}</h2><p className="muted">One item per line. Add optional details after a <code>|</code>, for example <code>Dust II | Competitive</code>.</p></div>{draft.id ? <button className="button button-secondary" type="button" onClick={() => setDraft(emptyDraft)}>New pool</button> : null}</div>
        <div className="two-column"><label className="form-stack compact"><span>Pool name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Friday maps" maxLength={120} /></label><label className="form-stack compact"><span>Type</span><select value={draft.poolType} onChange={(event) => setDraft((current) => ({ ...current, poolType: event.target.value as SavedPool["poolType"] }))}><option value="MAP">Maps</option><option value="GAME">Games</option><option value="MIXED">Mixed</option></select></label></div>
        <label className="form-stack"><span>Items <small>({itemCount})</small></span><textarea rows={10} value={draft.itemsText} onChange={(event) => setDraft((current) => ({ ...current, itemsText: event.target.value }))} placeholder={"Map 1\nMap 2 | Hard mode\nMap 3"} /></label>
        <div className="button-row"><button className="button" disabled={busy || draft.name.trim().length < 1 || itemCount < 1}>{busy ? "Saving…" : draft.id ? "Save changes" : "Save pool"}</button></div>
      </form>

      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}

      <section className="panel section-stack">
        <div><span className="eyebrow">Your library</span><h2>Saved pools</h2><p className="muted">Pick without repeats during a game night. Once every item has been used, the pool automatically starts a fresh cycle.</p></div>
        {pools.length ? <div className="pool-card-grid">{pools.map((pool) => {
          const selected = selectedItem(pool);
          const used = new Set(pickedByPool[pool.id] ?? []);
          return <article className="pool-card" key={pool.id}>
            <header><div><span className="card-kicker">{pool.poolType}</span><h3>{pool.name}</h3><small>{pool.items.length} items · {used.size}/{pool.items.length} used this cycle</small></div><div className="button-row"><button className="button button-secondary" type="button" disabled={busy} onClick={() => edit(pool)}>Edit</button><button className="button button-danger" type="button" disabled={busy} onClick={() => remove(pool)}>Delete</button></div></header>
            {selected ? <div className="pool-pick-result"><span>Selected</span><strong>{selected.label}</strong>{selected.details ? <small>{selected.details}</small> : null}</div> : <div className="empty-state compact">Nothing picked yet.</div>}
            <div className="button-row"><button className="button" type="button" onClick={() => pick(pool)}>{used.size >= pool.items.length && pool.items.length ? "Start new cycle" : "Pick next"}</button>{used.size ? <button className="button button-secondary" type="button" onClick={() => setPickedByPool((current) => ({ ...current, [pool.id]: [] }))}>Reset cycle</button> : null}</div>
            <details className="pool-items"><summary>View pool items</summary><div>{pool.items.map((item) => <span key={item.id}><strong>{item.label}</strong>{item.details ? <small>{item.details}</small> : null}</span>)}</div></details>
          </article>;
        })}</div> : <div className="empty-state">No saved pools yet. Create one above for your usual games, maps, modes, or challenges.</div>}
      </section>
    </div>
  );
}
