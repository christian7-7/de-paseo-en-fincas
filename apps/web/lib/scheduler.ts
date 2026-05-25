/**
 * Reminder scheduler — schedules 7 BullMQ jobs for a confirmed reservation.
 * If Redis/BullMQ is not available (dev without REDIS_URL), falls back to
 * creating Notification records in DB with scheduledAt timestamps.
 */
import { db } from "@repo/db";

const TIMING = {
  pre_trip_info: { hoursBeforeCheckIn: 48 },
  logistics: { hoursBeforeCheckIn: 24 },
  checkin_now: { hoursBeforeCheckIn: 0 },
  post_stay: { hoursAfterCheckOut: 6 },
  reengagement_30: { daysAfterCheckOut: 30 },
  reengagement_60: { daysAfterCheckOut: 60 },
  reengagement_90: { daysAfterCheckOut: 90 },
};

const TEMPLATES: Record<string, (data: { clientName: string; fincaName: string; municipality: string }) => string> = {
  pre_trip_info: (d) =>
    `¡Hola ${d.clientName}! 🌄 En 48 horas comienza tu escapada a ${d.fincaName} en ${d.municipality}. ¡Prepárate! ✨`,
  logistics: (d) =>
    `¡${d.clientName}, ya casi es hora! 🗺️ Mañana check-in en ${d.fincaName}. Recuerda tu documento de identidad.`,
  checkin_now: (d) =>
    `¡Bienvenido a ${d.fincaName}! 🏡 Ya puedes hacer el check-in. Que disfrutes tu paseo 🌿`,
  post_stay: (d) =>
    `Esperamos que hayas disfrutado tu estadía en ${d.fincaName}. ¿Nos cuentas cómo estuvo? Tu opinión nos ayuda a mejorar 🌟`,
  reengagement_30: (d) =>
    `¡${d.clientName}, han pasado 30 días desde tu paseo en ${d.fincaName}! Tenemos nuevas fincas disponibles 🌿`,
  reengagement_60: (d) =>
    `¡Hola ${d.clientName}! Hace 2 meses disfrutaste de ${d.fincaName}. Tenemos descuentos especiales esta temporada 🎉`,
  reengagement_90: (d) =>
    `¡${d.clientName}, te extrañamos! Como cliente especial tienes acceso anticipado a nuestras fincas premium 🏆`,
};

export async function scheduleReservationReminders(reservationId: string): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { client: true, finca: true },
  });

  if (!reservation) {
    console.error(`[scheduler] Reservation ${reservationId} not found`);
    return;
  }

  const { client, finca, checkIn, checkOut } = reservation;
  const templateData = {
    clientName: client.name || "Estimado cliente",
    fincaName: finca.name,
    municipality: finca.municipality,
  };
  const channel = (client.preferredChannel as "WHATSAPP" | "INSTAGRAM" | "WEB" | "EMAIL") || "EMAIL";

  const jobs: Array<{ type: string; scheduledAt: Date }> = [];

  // Pre-trip info (48h before)
  const preTripTime = new Date(checkIn.getTime() - TIMING.pre_trip_info.hoursBeforeCheckIn * 3600 * 1000);
  if (preTripTime > new Date()) jobs.push({ type: "pre_trip_info", scheduledAt: preTripTime });

  // Logistics (24h before)
  const logisticsTime = new Date(checkIn.getTime() - TIMING.logistics.hoursBeforeCheckIn * 3600 * 1000);
  if (logisticsTime > new Date()) jobs.push({ type: "logistics", scheduledAt: logisticsTime });

  // Check-in now (at check-in time)
  const checkInTime = new Date(checkIn.getTime() - TIMING.checkin_now.hoursBeforeCheckIn * 3600 * 1000);
  if (checkInTime > new Date()) jobs.push({ type: "checkin_now", scheduledAt: checkInTime });

  // Post-stay (6h after checkout)
  const postStayTime = new Date(checkOut.getTime() + TIMING.post_stay.hoursAfterCheckOut * 3600 * 1000);
  jobs.push({ type: "post_stay", scheduledAt: postStayTime });

  // Re-engagement 30/60/90 days
  for (const [type, config] of [
    ["reengagement_30", TIMING.reengagement_30] as const,
    ["reengagement_60", TIMING.reengagement_60] as const,
    ["reengagement_90", TIMING.reengagement_90] as const,
  ]) {
    const scheduledAt = new Date(checkOut.getTime() + config.daysAfterCheckOut * 24 * 3600 * 1000);
    jobs.push({ type, scheduledAt });
  }

  // Try to use BullMQ if Redis is configured
  if (process.env.REDIS_URL && process.env.REDIS_URL !== "redis://localhost:6379") {
    try {
      const { Queue } = await import("bullmq");
      const redisUrl = new URL(process.env.REDIS_URL);
      const queue = new Queue("notifications", {
        connection: {
          host: redisUrl.hostname,
          port: parseInt(redisUrl.port || "6379", 10),
          password: redisUrl.password || undefined,
          tls: redisUrl.protocol === "rediss:" ? {} : undefined,
        },
      });

      for (const job of jobs) {
        const delay = Math.max(0, job.scheduledAt.getTime() - Date.now());
        await queue.add(
          job.type,
          {
            type: job.type,
            reservationId,
            userId: client.id,
            fincaName: finca.name,
            municipality: finca.municipality,
            clientName: client.name || "Estimado cliente",
            checkIn: checkIn.toISOString(),
            checkOut: checkOut.toISOString(),
            channel,
            phone: client.phone || undefined,
            email: client.email || undefined,
          },
          {
            delay,
            jobId: `reminder_${reservationId}_${job.type}`,
            removeOnComplete: 500,
            removeOnFail: 200,
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
          }
        );
      }

      await queue.close();
      console.log(`[scheduler] Scheduled ${jobs.length} BullMQ jobs for reservation ${reservationId}`);
      return;
    } catch (err) {
      console.warn("[scheduler] BullMQ unavailable, falling back to DB scheduling:", err);
    }
  }

  // Fallback: create Notification records in DB with scheduledAt
  for (const job of jobs) {
    const templateFn = TEMPLATES[job.type];
    const body = templateFn ? templateFn(templateData) : `Recordatorio para ${finca.name}`;

    await db.notification.create({
      data: {
        userId: client.id,
        type: job.type,
        title: `Recordatorio — ${finca.name}`,
        body,
        channel,
        scheduledAt: job.scheduledAt,
        metadata: { reservationId, type: job.type },
      },
    });
  }

  console.log(`[scheduler] Created ${jobs.length} scheduled notifications in DB for reservation ${reservationId}`);
}
