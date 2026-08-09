"use client";

import { useState } from "react";

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info-tip" onMouseLeave={() => setOpen(false)}>
      <button
        className="info-tip-button"
        type="button"
        aria-label="More information"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >i</button>
      {open ? <span className="info-tip-popover" role="tooltip">{text}</span> : null}
    </span>
  );
}
