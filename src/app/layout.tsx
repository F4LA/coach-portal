import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Start Strong — Coach Portal",
  description: "Coach portal for Strong Standard client rosters and payouts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
