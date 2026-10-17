import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Build_Core",
  description: "Multi-Agent Architecture with Live Interactive Preview",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-950 text-white font-sans">{children}</body>
    </html>
  );
}