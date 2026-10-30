import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arq USDC/ARS Tracker",
  description:
    "Historial de la cotización USDC/ARS de Arq Finance, guardada cada 10 minutos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
