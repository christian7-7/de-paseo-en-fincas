import { createHash, createHmac } from "crypto";
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
      payment_method: Record<string, unknown>;
      customer_email?: string;
    };
  };
  timestamp: number;
  signature: {
    checksum: string;
    properties: string[];
  };
}

/**
 * Verifica la firma HMAC-SHA256 del webhook de Wompi.
 * checksum = SHA256(properties[0].value + properties[1].value + ... + events_secret)
 */
export function verifyWompiWebhook(event: WompiEvent): boolean {
  if (!WOMPI_EVENTS_SECRET) return true; // Skip in dev

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

/**
 * Procesa eventos del webhook de Wompi.
 */
export async function processWompiEvent(event: WompiEvent): Promise<void> {
  const tx = event.data.transaction;
  const { reference, status, id: wompiTransactionId, amount_in_cents, payment_method_type } = tx;

  // Extraer reservationId de la referencia (DPEF_<reservationId>)
  const reservationId = reference.replace("DPEF_", "");

  console.log(`[Wompi] Event: ${event.event} — ${reference} — ${status}`);

  switch (status) {
    case "APPROVED":
      await handleApproved({ reservationId, wompiTransactionId, amountInCents: amount_in_cents, paymentMethod: payment_method_type });
      break;
    case "DECLINED":
      await handleDeclined({ reservationId, wompiTransactionId });
      break;
    case "VOIDED":
      await handleVoided({ reservationId, wompiTransactionId });
      break;
    default:
      console.log(`[Wompi] Unhandled status: ${status}`);
  }
}

async function handleApproved(opts: {
  reservationId: string;
  wompiTransactionId: string;
  amountInCents: number;
  paymentMethod: string;
}): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: opts.reservationId },
    include: { client: true, finca: true },
  });

  if (!reservation) {
    console.error(`[Wompi] Reservation not found: ${opts.reservationId}`);
    return;
  }

  if (reservation.status === "CONFIRMED") {
    console.log(`[Wompi] Reservation ${opts.reservationId} already confirmed`);
    return;
  }

  // Update reservation status
  await db.reservation.update({
    where: { id: opts.reservationId },
    data: {
      status: "CONFIRMED",
      checkInCode: generateCheckInCode(),
    },
  });

  // Create/update payment record
  await db.payment.create({
    data: {
      reservationId: opts.reservationId,
      amount: Math.round(opts.amountInCents / 100),
      currency: "COP",
      method: mapPaymentMethod(opts.paymentMethod),
      provider: "WOMPI",
      providerId: opts.wompiTransactionId,
      status: "APPROVED",
      paidAt: new Date(),
    },
  });

  // Block availability dates
  const checkIn = new Date(reservation.checkIn);
  const checkOut = new Date(reservation.checkOut);
  const dates: Date[] = [];
  const current = new Date(checkIn);
  while (current < checkOut) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  await db.availability.updateMany({
    where: {
      fincaId: reservation.fincaId,
      date: { in: dates },
    },
    data: { status: "RESERVED", source: "RESERVATION" },
  });

  // Schedule reminders via Queue (scheduler service picks this up)
  try {
    const { Queue } = await import("bullmq");
    const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");
    const scheduleQueue = new Queue("schedule_reminders", {
      connection: { host: redisUrl.hostname, port: parseInt(redisUrl.port || "6379", 10) },
    });
    await scheduleQueue.add("schedule", { reservationId: opts.reservationId });
  } catch (err) {
    console.error("[Wompi] Error scheduling reminders:", err);
  }

  // Send confirmation notification
  await db.notification.create({
    data: {
      userId: reservation.clientId,
      type: "reservation_confirmed",
      title: `¡Reserva confirmada en ${reservation.finca.name}!`,
      body: `Tu reserva del ${reservation.checkIn.toLocaleDateString("es-CO")} al ${reservation.checkOut.toLocaleDateString("es-CO")} está confirmada. Código de acceso: ${reservation.checkInCode}`,
      channel: reservation.client.preferredChannel || "EMAIL",
      scheduledAt: new Date(),
      metadata: { reservationId: opts.reservationId },
    },
  });

  console.log(`✅ Reservation ${opts.reservationId} CONFIRMED`);
}

async function handleDeclined(opts: { reservationId: string; wompiTransactionId: string }): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: opts.reservationId },
    include: { client: true, finca: true },
  });

  if (!reservation) return;

  // Update payment record
  await db.payment.updateMany({
    where: { reservationId: opts.reservationId, status: "PENDING" },
    data: { status: "DECLINED", providerId: opts.wompiTransactionId },
  });

  // Notify client
  await db.notification.create({
    data: {
      userId: reservation.clientId,
      type: "payment_declined",
      title: "Pago no procesado",
      body: `Tu pago para ${reservation.finca.name} no pudo procesarse. Por favor intenta con otro método de pago.`,
      channel: reservation.client.preferredChannel || "EMAIL",
      scheduledAt: new Date(),
      metadata: { reservationId: opts.reservationId },
    },
  });

  console.log(`❌ Payment DECLINED for reservation ${opts.reservationId}`);
}

async function handleVoided(opts: { reservationId: string; wompiTransactionId: string }): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: opts.reservationId },
    include: { client: true, finca: true },
  });

  if (!reservation) return;

  // Cancel reservation
  await db.reservation.update({
    where: { id: opts.reservationId },
    data: { status: "CANCELLED", cancellationReason: "Pago anulado por el proveedor" },
  });

  // Update payment
  await db.payment.updateMany({
    where: { reservationId: opts.reservationId },
    data: { status: "REFUNDED", refundAt: new Date() },
  });

  // Free up availability
  await db.availability.updateMany({
    where: {
      fincaId: reservation.fincaId,
      date: { gte: reservation.checkIn, lt: reservation.checkOut },
      status: "RESERVED",
    },
    data: { status: "AVAILABLE", source: "MANUAL" },
  });

  // Cancel reminders via Queue
  try {
    const { Queue } = await import("bullmq");
    const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");
    const scheduleQueue = new Queue("schedule_reminders", {
      connection: { host: redisUrl.hostname, port: parseInt(redisUrl.port || "6379", 10) },
    });
    await scheduleQueue.add("cancel", { reservationId: opts.reservationId, action: "cancel" });
  } catch (err) {
    console.error("[Wompi] Error cancelling reminders:", err);
  }

  console.log(`🔄 Reservation ${opts.reservationId} CANCELLED (voided)`);
}

function generateCheckInCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function mapPaymentMethod(wompiMethod: string): "PSE" | "CARD" | "NEQUI" | "TRANSFER" | "CASH" | "ADDI" {
  const map: Record<string, "PSE" | "CARD" | "NEQUI" | "TRANSFER" | "CASH" | "ADDI"> = {
    PSE: "PSE",
    CARD: "CARD",
    NEQUI: "NEQUI",
    BANCOLOMBIA_TRANSFER: "TRANSFER",
    BANCOLOMBIA_COLLECT: "TRANSFER",
  };
  return map[wompiMethod] || "CARD";
}
