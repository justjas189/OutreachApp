import "@fontsource-variable/manrope";
import "@fontsource-variable/roboto-mono";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rip City Outreach",
    template: "%s · Rip City Outreach",
  },
  description: "Private, admin-operated campaign recipient importing for Rip City Review.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
