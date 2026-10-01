// Add these three things to app/layout.tsx. Nothing else.
import "@atengku/site-chat/styles.css";
import { SiteChat } from "@atengku/site-chat/react";
import siteChat from "@/site-chat.config";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Mount once, last, so it layers above the page. */}
        <SiteChat config={siteChat} />
      </body>
    </html>
  );
}
