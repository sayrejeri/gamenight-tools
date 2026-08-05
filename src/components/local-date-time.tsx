"use client";

import { useEffect, useMemo, useState } from "react";

export function LocalDateTime({
  value,
  fallbackTimeZone,
  includeRelative = false,
}: {
  value: string | Date | null;
  fallbackTimeZone?: string | null;
  includeRelative?: boolean;
}) {
  const iso = value instanceof Date ? value.toISOString() : value;
  const [browserTimeZone, setBrowserTimeZone] = useState<string | null>(null);

  useEffect(() => {
    setBrowserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);

  const display = useMemo(() => {
    if (!iso) return "Not scheduled";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Invalid date";

    const timeZone = browserTimeZone ?? fallbackTimeZone ?? undefined;
    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
      timeZoneName: "short",
    }).format(date);

    if (!includeRelative) return formatted;
    const difference = date.getTime() - Date.now();
    const minutes = Math.round(difference / 60000);
    const relative = Math.abs(minutes) < 60
      ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(minutes, "minute")
      : Math.abs(minutes) < 1440
        ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(minutes / 60), "hour")
        : new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(minutes / 1440), "day");

    return `${formatted} · ${relative}`;
  }, [browserTimeZone, fallbackTimeZone, includeRelative, iso]);

  return <time dateTime={iso ?? undefined} suppressHydrationWarning>{display}</time>;
}
