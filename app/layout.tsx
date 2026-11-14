import type { Metadata, Viewport } from "next";
import "./globals.css";
import ErrorReporter from "@/components/ErrorReporter";
import IconHelp from "@/components/IconHelp";

export const metadata: Metadata = {
  title: "Build_Core",
  description: "Multi-Agent Architecture with Live Interactive Preview",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* With JavaScript off the app cannot run, so show nothing instead of raw markup. */}
        <noscript>
          <style>{`body{display:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col bg-neutral-950 text-white font-sans">
        <ErrorReporter />
        <IconHelp />
        {children}
      </body>
    </html>
  );
}