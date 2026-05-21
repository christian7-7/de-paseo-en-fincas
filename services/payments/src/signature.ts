import { createHash } from "crypto";

/**
 * Genera la firma de integridad para el widget de Wompi.
 * Fórmula: SHA256(reference + amount + currency + integritySecret)
 *
 * @param reference   - Referencia única de la transacción (reservationId)
 * @param amountInCents - Monto en centavos (COP × 100)
 * @param currency    - Moneda (COP)
 * @param integritySecret - Secret de integridad de Wompi
 */
export function generateWompiSignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string
): string {
  const rawString = `${reference}${amountInCents}${currency}${integritySecret}`;
  return createHash("sha256").update(rawString, "utf8").digest("hex");
}

/**
 * Genera los parámetros necesarios para el widget de Wompi.
 */
export function generateWompiWidgetParams(opts: {
  reservationId: string;
  totalPriceCOP: number;
  clientEmail?: string;
  redirectUrl?: string;
}): {
  publicKey: string;
  currency: string;
  amountInCents: number;
  reference: string;
  signature: string;
  redirectUrl?: string;
  customerEmail?: string;
} {
  const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
  const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || "";
  const currency = "COP";
  const amountInCents = opts.totalPriceCOP * 100; // COP to centavos
  const reference = `DPEF_${opts.reservationId}`;

  const signature = generateWompiSignature(reference, amountInCents, currency, WOMPI_INTEGRITY_SECRET);

  return {
    publicKey: WOMPI_PUBLIC_KEY,
    currency,
    amountInCents,
    reference,
    signature,
    redirectUrl: opts.redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://depaseoenfincas.co"}/reservar/${opts.reservationId}?payment=success`,
    customerEmail: opts.clientEmail,
  };
}
