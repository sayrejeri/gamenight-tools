"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  active: boolean;
  intervalMs?: number;
};

export function SpectatorLiveRefresh({ active, intervalMs = 5000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    const timer = window.setInterval(refreshIfVisible, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, intervalMs, router]);

  if (!active) return null;
  return <span className="badge" title="This spectator view refreshes live tournament data automatically.">Live updates · ~5s</span>;
}
