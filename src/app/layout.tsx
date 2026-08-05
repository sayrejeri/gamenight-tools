import type { Metadata } from "next";
import "./globals.css";
import "./expanded.css";
import "./management.css";
import "./community.css";
import "./safety.css";
import "./roster.css";
import "./hotfix.css";

export const metadata: Metadata = {
  title: {
    default: "Game Night Tools",
    template: "%s · Game Night Tools",
  },
  description: "Discord-powered events, teams, community profiles, suggestions, tools, and server workspaces.",
  applicationName: "Game Night Tools",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Game Night Tools",
    description: "Run game nights, build teams, manage communities, and organize events from one Discord-connected platform.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
