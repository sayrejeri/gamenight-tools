import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Game Night Tools",
  description: "Discord-powered game night events, signups, hosts, brackets, and shared server workspaces.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
