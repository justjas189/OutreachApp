import "@fontsource-variable/manrope";
import "@fontsource-variable/roboto-mono";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AtlasReach — Admin Desk",
    template: "%s | AtlasReach",
  },
  description: "AtlasReach outreach campaign management platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
