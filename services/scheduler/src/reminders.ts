import { Queue } from "bullmq";
import { db } from "@repo/db";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisConnection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || "6379", 10),
};

const notificationQueue = new Queue("notifications", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: parseInt(process.env.NOTIFICATION_MAX_RETRIES || "3", 10),
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 500,
    removeOnFail: 200,
  },
});

// ─── Timing config from env (hours before/after event) ────────────────────────
const TIMING = {
  pre_trip_info_hours_before: parseInt(process.env.REMINDER_PRE_TRIP_HOURS || "48", 10),
  logistics_hours_before: parseInt(process.env.REMINDER_LOGISTICS_HOURS || "24", 10),
  checkin_now_hours_before: parseInt(process.env.REMINDER_CHECKIN_HOURS || "0", 10),
  post_stay_hours_after: parseInt(process.env.REMINDER_POST_STAY_HOURS || "6", 10),
  reengagement_30_days: parseInt(process.env.REMINDER_REENGAGEMENT_30 || "30", 10),
  reengagement_60_days: parseInt(process.env.REMINDER_REENGAGEMENT_60 || "60", 10),
  reengagement_90_days: parseInt(process.env.REMINDER_REENGAGEMENT_90 || "90", 10),
};

export type ReminderJobType =
  | "pre_trip_info"
  | "logistics"
  | "checkin_now"
  | "post_stay"
  | "reengagement_30"
  | "reengagement_60"
  | "reengagement_90";

interface ReminderJobData {
  type: ReminderJobType;
  reservationId: string;
  userId: string;
  fincaName: string;
  municipality: string;
  clientName: string;
  checkIn: string;
  checkOut: string;
  channel: string;
  phone?: string;
  email?: string;
}

export async function scheduleAll(reservationId: string): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: {
      client: true,
      finca: true,
    },
  });

  if (!reservation) {
    throw new Error(`Reservation ${reservationId} not found`);
  }

  const { client, finca, checkIn, checkOut } = reservation;

  const baseData: Omit<ReminderJobData, "type"> = {
    reservationId,
    userId: client.id,
    fincaName: finca.name,
    municipality: finca.municipality,
    clientName: client.name || "Estimado cliente",
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    channel: client.preferredChannel || "EMAIL",
    phone: client.phone || undefined,
    email: client.email || undefined,
  };

  const jobs: Array<{ type: ReminderJobType; delay: number }> = [
    // Pre-trip info: N hours before check-in
    {
      type: "pre_trip_info",
      delay: Math.max(0, checkIn.getTime() - Date.now() - TIMING.pre_trip_info_hours_before * 3600 * 1000),
    },
    // Logistics: N hours before check-in
    {
      type: "logistics",
      delay: Math.max(0, checkIn.getTime() - Date.now() - TIMING.logistics_hours_before * 3600 * 1000),
    },
    // Check-in now: at check-in time
    {
      type: "checkin_now",
      delay: Math.max(0, checkIn.getTime() - Date.now() - TIMING.checkin_now_hours_before * 3600 * 1000),
    },
    // Post-stay: N hours after check-out
    {
      type: "post_stay",
      delay: Math.max(0, checkOut.getTime() - Date.now() + TIMING.post_stay_hours_after * 3600 * 1000),
    },
    // Re-engagement: 30 days after check-out
    {
      type: "reengagement_30",
      delay: checkOut.getTime() - Date.now() + TIMING.reengagement_30_days * 24 * 3600 * 1000,
    },
    // Re-engagement: 60 days after check-out
    {
      type: "reengagement_60",
      delay: checkOut.getTime() - Date.now() + TIMING.reengagement_60_days * 24 * 3600 * 1000,
    },
    // Re-engagement: 90 days after check-out
    {
      type: "reengagement_90",
      delay: checkOut.getTime() - Date.now() + TIMING.reengagement_90_days * 24 * 3600 * 1000,
    },
  ];

  for (const { type, delay } of jobs) {
    // Only schedule future jobs
    if (delay < 0) {
      console.log(`[Scheduler] Skipping ${type} (already past)`);
      continue;
    }

    const jobData: ReminderJobData = { ...baseData, type };
    const jobId = `reminder_${reservationId}_${type}`;

    const job = await notificationQueue.add(type, jobData, {
      delay,
      jobId,
      // Remove existing job if rescheduling
    });

    // Save jobId to Notification table for cancellation
    await db.notification.create({
      data: {
        userId: client.id,
        type,
        title: `Recordatorio ${type} — ${finca.name}`,
        body: `Recordatorio programado para la reserva en ${finca.name}`,
        channel: (client.preferredChannel as "WHATSAPP" | "INSTAGRAM" | "WEB" | "EMAIL") || "EMAIL",
        scheduledAt: new Date(Date.now() + delay),
        jobId: job.id,
        metadata: { reservationId, type },
      },
    });

    console.log(
      `[Scheduler] Scheduled ${type} for reservation ${reservationId} in ${Math.round(delay / 3600000)}h`
    );
  }
}

export async function cancelAllJobs(reservationId: string): Promise<void> {
  // Find all pending notifications for this reservation
  const notifications = await db.notification.findMany({
    where: {
      sentAt: null,
      metadata: { path: ["reservationId"], equals: reservationId },
      jobId: { not: null },
    },
  });

  for (const notification of notifications) {
    if (!notification.jobId) continue;

    try {
      const job = await notificationQueue.getJob(notification.jobId);
      if (job) {
        const state = await job.getState();
        if (["waiting", "delayed", "active"].includes(state)) {
          await job.remove();
          console.log(`[Scheduler] Cancelled job ${notification.jobId} (${notification.type})`);
        }
      }
    } catch (err) {
      console.warn(`[Scheduler] Could not cancel job ${notification.jobId}:`, err);
    }
  }

  // Mark notifications as cancelled in DB
  await db.notification.updateMany({
    where: {
      sentAt: null,
      metadata: { path: ["reservationId"], equals: reservationId },
    },
    data: {
      sentAt: new Date(),
      metadata: { reservationId, cancelled: true },
    },
  });

  console.log(`[Scheduler] Cancelled all jobs for reservation ${reservationId}`);
}

// ─── Worker process for executing notifications ────────────────────────────────
if (process.env.RUN_WORKER === "true") {
  const { Worker } = await import("bullmq");

  const notificationWorker = new Worker<ReminderJobData>(
    "notifications",
    async (job) => {
      const data = job.data;
      console.log(`[NotificationWorker] Executing ${data.type} for reservation ${data.reservationId}`);

      // Inline notification dispatch to avoid cross-service imports
      const sendWhatsApp = async (phone: string, text: string) => {
        const waApiUrl = process.env.WHATSAPP_API_URL;
        const waToken = process.env.WHATSAPP_API_TOKEN;
        const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (!waApiUrl || !waToken || !waPhoneId) return;
        await fetch(`${waApiUrl}/${waPhoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text } }),
        });
      };
      const sendEmail = async (to: string, subject: string, vars: Record<string, string>) => {
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) return;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "no-reply@depaseoenfincas.co", to, subject, html: `<p>${vars.message}</p>` }),
        });
      };

      const templates: Record<ReminderJobType, string> = {
        pre_trip_info: `¡Hola ${data.clientName}! 🌄 En 48 horas comienza tu escapada a ${data.fincaName} en ${data.municipality}. Prepárate para una experiencia increíble! ✨`,
        logistics: `¡${data.clientName}, ya casi es hora! 🗺️ Mañana check-in en ${data.fincaName}. Recuerda llevar tu documento de identidad.`,
        checkin_now: `¡Bienvenido a ${data.fincaName}! 🏡 Ya puedes hacer el check-in. Que disfrutes tu paseo 🌿`,
        post_stay: `Esperamos que hayas disfrutado tu estadía en ${data.fincaName}. ¿Nos cuentas cómo estuvo? Tu opinión nos ayuda a mejorar 🌟`,
        reengagement_30: `¡${data.clientName}, han pasado 30 días desde tu paseo en ${data.fincaName}! Tenemos nuevas fincas disponibles que podrían gustarte 🌿`,
        reengagement_60: `¡Hola ${data.clientName}! Hace 2 meses disfrutaste de ${data.fincaName}. Tenemos descuentos especiales esta temporada 🎉`,
        reengagement_90: `¡${data.clientName}, te extrañamos! Han pasado 3 meses. Como cliente especial tienes acceso anticipado a nuestras fincas premium 🏆`,
      };

      const message = templates[data.type];

      if (data.channel === "WHATSAPP" && data.phone) {
        await sendWhatsApp(data.phone, message);
      } else if (data.email) {
        await sendEmail(data.email, data.type, { message, fincaName: data.fincaName });
      }

      // Mark as sent
      await db.notification.updateMany({
        where: {
          metadata: { path: ["reservationId"], equals: data.reservationId },
        },
        data: { sentAt: new Date() },
      });
    },
    { connection: redisConnection, concurrency: 10 }
  );

  console.log("🔔 Notification worker started");
}
