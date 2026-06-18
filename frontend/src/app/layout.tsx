import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CODE-AI — CVE Security Analyzer",
  description:
    "Detect, validate, and remediate CVE vulnerabilities in Python code using local LLMs. No data leaves your machine.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-background text-foreground">
        <TooltipProvider delayDuration={400}>
          {children}
        </TooltipProvider>
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: { fontSize: "12px" },
          }}
        />
      </body>
    </html>
  );
}
