import type { Metadata } from "next";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DraftPilot — A thoughtful reply, every time",
  description:
    "Your team’s customer support drafting workspace. Ground responses in your knowledge, protect sensitive details, and keep a human in control.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
