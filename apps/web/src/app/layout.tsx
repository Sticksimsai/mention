import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mentions",
  icons: { icon: [{ url: "/brand/favicon.svg?v=4", type: "image/svg+xml" }], shortcut: "/brand/favicon.svg?v=4" },
  description: "Post on the public feed and launch a community token on Solana with Pump.fun.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
