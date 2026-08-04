"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RedeemCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/workspaces/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { error?: string; type?: string };
      if (!response.ok) throw new Error(body.error ?? "The code could not be redeemed.");

      setCode("");
      setMessage(body.type === "EVENT" ? "You joined the event signup list." : "Access added to your account.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The code could not be redeemed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <label htmlFor="join-code">Staff, host, or event code</label>
      <div className="inline-form">
        <input
          id="join-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="GN-ABCD-1234"
          autoComplete="off"
        />
        <button className="button" type="button" disabled={busy || code.trim().length < 5} onClick={redeem}>
          {busy ? "Checking…" : "Redeem"}
        </button>
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
