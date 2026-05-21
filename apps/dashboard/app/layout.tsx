import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TRPCProvider } from "../lib/TRPCProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Dashboard — De Paseo en Fincas",
  description: "Panel de asesores y administración",
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-background antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
