import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { UploadProvider } from "./components/UploadProvider";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Glimpse",
  description:
    "Semantic image search powered by OpenRouter vision and embedding models, and Qdrant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
      >
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <UploadProvider>
          <Suspense>
            <Navbar />
          </Suspense>
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </UploadProvider>
      </body>
    </html>
  );
}
