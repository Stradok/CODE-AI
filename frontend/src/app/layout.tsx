import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const displayFont = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const bodyFont = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
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
  themeColor: "#E0E5EC",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-background text-foreground">
        <TooltipProvider delay={400}>
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
