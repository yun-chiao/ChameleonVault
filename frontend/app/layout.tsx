import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChameleonVault",
  description:
    "Radically transparent AI-managed RWA vault on Mantle — Turing Test Hackathon 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-void text-neutral-200 antialiased">{children}</body>
    </html>
  );
}
