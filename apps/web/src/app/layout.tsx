import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mentions",
  icons: { icon: [{ url: "/brand/favicon.svg?v=4", type: "image/svg+xml" }], shortcut: "/brand/favicon.svg?v=4" },
  description: "Social trading on Solana. Launch a token, mint its community — posts mirror between here and X, with the chart live in the room.",
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
