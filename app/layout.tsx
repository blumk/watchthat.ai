import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watchthat – Web Change Monitor",
  description:
    "Paste a URL. Watchthat takes a snapshot, watches in the background, and alerts you when something changes.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐕</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Auto-reload if webpack fails to hydrate a chunk after a server restart */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('error', function(e) {
            if (e && e.message && e.message.indexOf('__webpack_modules__') !== -1) {
              window.location.reload();
            }
          });
        `}} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
