import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@repo/db";
import { auth } from "../../../../lib/auth";

const WOMPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || "";

const bodySchema = z.object({
  reservationId: z.string(),
  paymentMethod: z.enum(["PSE", "CARD", "NEQUI"]).default("PSE"),
  customerEmail: z.string().email().optional(),
  redirectUrl: z.string().url().optional(),
});

/**
 * Generates Wompi integrity signature:
 * SHA256(reference + amount_in_cents + currency + integrity_secret)
 */
function generateIntegritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string
): string {
  const str = `${reference}${amountInCents}${currency}${integritySecret}`;
  return createHash("sha256").update(str).digest("hex");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    body = bodySchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const reservation = await db.reservation.findUnique({
    where: { id: body.reservationId, clientId: session.user.id },
    include: { finca: true, client: true },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  if (reservation.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: `La reserva está en estado ${reservation.status}` },
      { status: 409 }
    );
  }

  const reference = `DPEF_${reservation.id}`;
  const amountInCents = reservation.totalPrice * 100; // COP, no decimals
  const currency = "COP";
  const integritySignature = generateIntegritySignature(
    reference,
    amountInCents,
    currency,
    WOMPI_EVENTS_SECRET
  );

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const redirectUrl = body.redirectUrl || `${baseUrl}/reservar/${reservation.id}/confirmacion`;

  // If Wompi keys are configured, use the real API
  if (WOMPI_PUBLIC_KEY && WOMPI_PRIVATE_KEY) {
    try {
      const wompiRes = await fetch("https://production.wompi.co/v1/payment_links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Reserva ${reservation.finca.name}`,
          description: `${reservation.nights} noche(s) — ${reservation.finca.municipality}`,
          single_use: true,
          collect_shipping: false,
          currency,
          amount_in_cents: amountInCents,
          redirect_url: redirectUrl,
          customer_data: {
            email: reservation.client.email,
            full_name: reservation.client.name,
            phone_number: reservation.client.phone || undefined,
          },
          reference,
        }),
      });

      if (!wompiRes.ok) {
        const errBody = await wompiRes.text();
        console.error("[payments/create] Wompi error:", errBody);
        throw new Error("Wompi API error");
      }

      const wompiData = await wompiRes.json();
      const checkoutUrl = `https://checkout.wompi.co/l/${wompiData.data?.id}`;

      // Save pending payment record
      await db.payment.create({
        data: {
          reservationId: reservation.id,
          amount: reservation.totalPrice,
          currency: "COP",
          method: body.paymentMethod,
          provider: "WOMPI",
          providerId: wompiData.data?.id,
          status: "PENDING",
        },
      });

      return NextResponse.json({
        checkoutUrl,
        reference,
        amountInCents,
        integritySignature,
      });
    } catch (err) {
      console.error("[payments/create] Error creating Wompi link:", err);
    }
  }

  // Fallback: Wompi widget mode (public key only — redirect to checkout widget)
  if (WOMPI_PUBLIC_KEY) {
    const widgetUrl = new URL("https://checkout.wompi.co/p/");
    widgetUrl.searchParams.set("public-key", WOMPI_PUBLIC_KEY);
    widgetUrl.searchParams.set("currency", currency);
    widgetUrl.searchParams.set("amount-in-cents", String(amountInCents));
    widgetUrl.searchParams.set("reference", reference);
    widgetUrl.searchParams.set("signature:integrity", integritySignature);
    widgetUrl.searchParams.set("redirect-url", redirectUrl);

    return NextResponse.json({
      checkoutUrl: widgetUrl.toString(),
      reference,
      amountInCents,
      integritySignature,
      mode: "widget",
    });
  }

  // Dev mode — simulate payment approval
  console.log("[payments/create] DEV MODE — simulating payment approval");
  const checkInCode = Array.from({ length: 6 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  ).join("");

  await db.reservation.update({
    where: { id: reservation.id },
    data: { status: "CONFIRMED", checkInCode },
  });

  await db.payment.create({
    data: {
      reservationId: reservation.id,
      amount: reservation.totalPrice,
      currency: "COP",
      method: "CARD",
      provider: "WOMPI",
      providerId: `DEV_${Date.now()}`,
      status: "APPROVED",
      paidAt: new Date(),
    },
  });

  return NextResponse.json({
    checkoutUrl: `${baseUrl}/reservar/${reservation.id}/confirmacion`,
    reference,
    devMode: true,
    checkInCode,
  });
}
