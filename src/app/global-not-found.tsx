import Link from "next/link";
import type { Metadata } from "next";
import { fontClassName } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "404 · ShinyQ HQ",
  description: "Room not found.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center justify-center p-4">
        <main className="glass max-w-md p-8 text-center">
          <p className="font-mono text-4xl text-cyan" aria-hidden="true">
            o_o
          </p>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">Room not found</h1>
          <p className="mt-2 text-ink-2">The rover could not find that room. / Rover tidak menemukan ruangan itu.</p>
          <p className="mt-6 flex justify-center gap-4">
            <Link className="link" href="/en">
              Lobby (EN)
            </Link>
            <Link className="link" href="/id">
              Lobi (ID)
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
