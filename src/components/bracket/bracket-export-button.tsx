"use client";

import { useState } from "react";
import { downloadBracketPng } from "@/components/bracket/bracket-export";
import { isDraft } from "@/components/bracket/bracket-model";

export function BracketExportButton({ state }: { state: unknown }) {
  const [message, setMessage] = useState("");

  function download() {
    if (!isDraft(state)) {
      setMessage("This competition cannot be exported yet.");
      return;
    }
    setMessage(downloadBracketPng({ draft: state }) ?? "");
  }

  return (
    <span>
      <button className="button button-secondary" type="button" onClick={download}>Download PNG</button>
      {message ? <span className="field-help" aria-live="polite">{message}</span> : null}
    </span>
  );
}
