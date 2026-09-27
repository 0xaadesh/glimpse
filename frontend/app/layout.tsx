import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Glimpse",
  description:
    "Semantic image search powered by Groq Vision, Gemini Embeddings, and Qdrant",
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
        <Suspense>
          <Navbar />
        </Suspense>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
