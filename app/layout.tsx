import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchThat – Web Change Monitor",
  description:
    "Paste a URL. WatchThat takes a snapshot, watches in the background, and alerts you when something changes.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='none'><path d='M17 24 L11 9 L24 19Z' fill='%233b82f6'/><path d='M47 24 L53 9 L40 19Z' fill='%233b82f6'/><ellipse cx='32' cy='40' rx='23' ry='21' fill='%233b82f6'/><circle cx='21' cy='33' r='10' fill='white'/><circle cx='21' cy='33' r='6' fill='%231e293b'/><circle cx='24' cy='30' r='2.5' fill='white' opacity='.85'/><circle cx='43' cy='33' r='10' fill='white'/><circle cx='43' cy='33' r='6' fill='%231e293b'/><circle cx='46' cy='30' r='2.5' fill='white' opacity='.85'/><path d='M27 42 L32 49 L37 42Z' fill='%23f59e0b'/></svg>",
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
