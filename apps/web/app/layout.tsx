import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { TRPCProvider } from "../lib/TRPCProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "De Paseo en Fincas | Arriendo de Fincas en Colombia",
    template: "%s | De Paseo en Fincas",
  },
  description:
    "Encuentra y arrienda las mejores fincas de Colombia. Guatapé, Salento, Anapoima, Melgar, San Gil y más destinos. Reserva fácil, pago seguro.",
  keywords: ["fincas colombia", "arriendo fincas", "turismo rural", "vacaciones colombia"],
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "https://depaseoenfincas.co",
    siteName: "De Paseo en Fincas",
  },
  robots: { index: true, follow: true },
};

const primaryColor = process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY || "E8832A";
const darkColor = process.env.NEXT_PUBLIC_BRAND_COLOR_DARK || "1A1D2E";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <style>{`
          :root {
            --brand-primary: #${primaryColor};
            --brand-dark: #${darkColor};
          }
        `}</style>
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>
          <TRPCProvider>
            {children}
          </TRPCProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
