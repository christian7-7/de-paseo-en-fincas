import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Portal Propietarios — De Paseo en Fincas",
  description: "Gestiona tus fincas, disponibilidad y reservas",
  robots: { index: false },
};

export default function OwnerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-background antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
