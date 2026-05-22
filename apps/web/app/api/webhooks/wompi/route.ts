import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@repo/db";

const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || "";

interface WompiEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      reference: string;
      status: "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING";
      amount_in_cents: number;
      currency: string;
      payment_method_type: string;
      customer_email?: string;
    };
  };
  timestamp: number;
  signature: {
    checksum: string;
    properties: string[];
  };
}

function verifySignature(event: WompiEvent): boolean {
  if (!WOMPI_EVENTS_SECRET) return true; // Skip verification in dev

  const { signature, data, timestamp } = event;
  const concatString = signature.properties
    .map((prop) => {
      const parts = prop.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = { data, timestamp };
      for (const part of parts) {
        value = value?.[part];
      }
      return value ?? "";
    })
    .join("")
    .concat(WOMPI_EVENTS_SECRET);

  const expected = createHash("sha256").update(concatString).digest("hex");
  return expected === signature.checksum;
}

function generateCheckInCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function mapPaymentMethod(
  wompiMethod: string
): "PSE" | "CARD" | "NEQUI" | "TRANSFER" | "CASH" | "ADDI" {
  const map: Record<string, "PSE" | "CARD" | "NEQUI" | "TRANSFER" | "CASH" | "ADDI"> = {
    PSE: "PSE",
    CARD: "CARD",
    NEQUI: "NEQUI",
    BANCOLOMBIA_TRANSFER: "TRANSFER",
    BANCOLOMBIA_COLLECT: "TRANSFER",
  };
  return map[wompiMethod] ?? "CARD";
}

export async function POST(req: NextRequest) {
  let event: WompiEvent;

  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!verifySignature(event)) {
    console.error("[Wompi webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const tx = event.data.transaction;
  const { reference, status, id: wompiTxId, amount_in_cents, payment_method_type } = tx;

  // Reference format: DPEF_<reservationId>
  const reservationId = reference.replace("DPEF_", "");
  console.log(`[Wompi] ${event.event} — ${reference} — ${status}`);

  try {
    if (status === "APPROVED") {
      const reservation = await db.reservation.findUnique({
        where: { id: reservationId },
        include: { client: true, finca: true },
      });

      if (!reservation) {
        console.error(`[Wompi] Reservation not found: ${reservationId}`);
        return NextResponse.json({ ok: true });
      }

      if (reservation.status === "CONFIRMED") {
        return NextResponse.json({ ok: true }); // Idempotent
      }

      const checkInCode = generateCheckInCode();

      await db.reservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED", checkInCode },
      });

      await db.payment.create({
        data: {
          reservationId,
          amount: Math.round(amount_in_cents / 100),
          currency: "COP",
          method: mapPaymentMethod(payment_method_type),
          provider: "WOMPI",
          providerId: wompiTxId,
          status: "APPROVED",
          paidAt: new Date(),
        },
      });

      // Block availability dates
      const dates: Date[] = [];
      const cur = new Date(reservation.checkIn);
      while (cur < reservation.checkOut) {
        dates.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }

      if (dates.length > 0) {
        // Create or update availability blocks
        await db.availability.createMany({
          data: dates.map((date) => ({
            fincaId: reservation.fincaId,
            date,
            status: "RESERVED" as const,
            source: "RESERVATION",
          })),
          skipDuplicates: true,
        });

        await db.availability.updateMany({
          where: { fincaId: reservation.fincaId, date: { in: dates } },
          data: { status: "RESERVED", source: "RESERVATION" },
        });
      }

      // Notification
      await db.notification.create({
        data: {
          userId: reservation.clientId,
          type: "reservation_confirmed",
          title: `¡Reserva confirmada en ${reservation.finca.name}!`,
          body: `Tu reserva del ${reservation.checkIn.toLocaleDateString("es-CO")} al ${reservation.checkOut.toLocaleDateString("es-CO")} está confirmada. Código de acceso: ${checkInCode}`,
          channel: reservation.client.preferredChannel ?? "EMAIL",
          scheduledAt: new Date(),
          metadata: { reservationId },
        },
      });

      console.log(`✅ Reservation ${reservationId} CONFIRMED — code ${checkInCode}`);
    } else if (status === "DECLINED") {
      const reservation = await db.reservation.findUnique({
        where: { id: reservationId },
        include: { client: true, finca: true },
      });

      if (!reservation) return NextResponse.json({ ok: true });

      await db.payment.updateMany({
        where: { reservationId, status: "PENDING" },
        data: { status: "DECLINED", providerId: wompiTxId },
      });

      await db.notification.create({
        data: {
          userId: reservation.clientId,
          type: "payment_declined",
          title: "Pago no procesado",
          body: `Tu pago para ${reservation.finca.name} no pudo procesarse. Por favor intenta con otro método de pago.`,
          channel: reservation.client.preferredChannel ?? "EMAIL",
          scheduledAt: new Date(),
          metadata: { reservationId },
        },
      });

      console.log(`❌ Payment DECLINED for ${reservationId}`);
    } else if (status === "VOIDED") {
      const reservation = await db.reservation.findUnique({
        where: { id: reservationId },
        include: { client: true, finca: true },
      });

      if (!reservation) return NextResponse.json({ ok: true });

      await db.reservation.update({
        where: { id: reservationId },
        data: { status: "CANCELLED", cancellationReason: "Pago anulado" },
      });

      await db.payment.updateMany({
        where: { reservationId },
        data: { status: "REFUNDED", refundAt: new Date() },
      });

      await db.availability.updateMany({
        where: {
          fincaId: reservation.fincaId,
          date: { gte: reservation.checkIn, lt: reservation.checkOut },
          status: "RESERVED",
        },
        data: { status: "AVAILABLE", source: "MANUAL" },
      });

      console.log(`🔄 Reservation ${reservationId} CANCELLED (voided)`);
    }
  } catch (err) {
    console.error("[Wompi webhook] Error processing event:", err);
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
