import type { Metadata } from "next";
import "./globals.css";
import "./expanded.css";
import "./management.css";
import "./community.css";
import "./safety.css";
import "./roster.css";
import "./hotfix.css";
import "./admin-profile.css";
import "./admin-moderation.css";
import "./mobile-navigation.css";
import "./request-form.css";
import "./v037.css";
import "./v038.css";
import "./v040.css";
import "./v041.css";

export const metadata: Metadata = {
  title: { default: "Game Night Tools", template: "%s · Game Night Tools" },
  description: "Discord-powered events, teams, community profiles, communication, suggestions, tools, and server workspaces.",
  applicationName: "Game Night Tools",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: "Game Night Tools",
    description: "Run game nights, communicate with communities, build teams, manage events, and organize tournaments from one Discord-connected platform.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
