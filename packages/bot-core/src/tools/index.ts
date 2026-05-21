import { z } from "zod";
import { db } from "@repo/db";
import type { Prisma } from "@prisma/client";
import type { LLMTool } from "../llm/router";

// ─── Tool result type ─────────────────────────────────────────────────────────
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

// 1. search_fincas
const SearchFincasSchema = z.object({
  municipality: z.string().optional().describe("Municipio o ciudad deseada"),
  department: z.string().optional().describe("Departamento de Colombia"),
  checkIn: z.string().optional().describe("Fecha entrada YYYY-MM-DD"),
  checkOut: z.string().optional().describe("Fecha salida YYYY-MM-DD"),
  adults: z.number().min(1).optional().describe("Número de adultos"),
  children: z.number().min(0).optional().describe("Número de niños"),
  minPrice: z.number().optional().describe("Precio mínimo por noche en COP"),
  maxPrice: z.number().optional().describe("Precio máximo por noche en COP"),
  amenities: z.array(z.string()).optional().describe("Amenidades requeridas: piscina, bbq, wifi, etc."),
  limit: z.number().default(3).describe("Número máximo de resultados"),
});

async function executeSearchFincas(args: z.infer<typeof SearchFincasSchema>): Promise<ToolResult> {
  try {
    const totalGuests = (args.adults || 1) + (args.children || 0);
    const where: Prisma.FincaWhereInput = {
      status: "ACTIVE",
      ...(args.municipality && { municipality: { contains: args.municipality, mode: "insensitive" } }),
      ...(args.department && { department: { contains: args.department, mode: "insensitive" } }),
      ...(totalGuests > 0 && { capacity: { gte: totalGuests } }),
      ...(args.minPrice && { pricePerNight: { gte: args.minPrice } }),
      ...(args.maxPrice && { pricePerNight: { lte: args.maxPrice } }),
      ...(args.amenities?.length && { amenities: { hasEvery: args.amenities } }),
    };

    const fincas = await db.finca.findMany({
      where,
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        reviews: { select: { rating: true } },
      },
      orderBy: [{ featured: "desc" }, { pricePerNight: "asc" }],
      take: args.limit,
    });

    const results = fincas.map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      municipality: f.municipality,
      department: f.department,
      capacity: f.capacity,
      bedrooms: f.bedrooms,
      pricePerNight: f.pricePerNight,
      weekendPrice: f.weekendPrice,
      amenities: f.amenities.slice(0, 5),
      shortDescription: f.shortDescription,
      imageUrl: f.images[0]?.url,
      avgRating:
        f.reviews.length > 0
          ? Math.round((f.reviews.reduce((s, r) => s + r.rating, 0) / f.reviews.length) * 10) / 10
          : null,
      reviewCount: f.reviews.length,
    }));

    return { success: true, data: { fincas: results, total: results.length } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error buscando fincas" };
  }
}

// 2. check_availability
const CheckAvailabilitySchema = z.object({
  fincaId: z.string().describe("ID de la finca"),
  checkIn: z.string().describe("Fecha entrada YYYY-MM-DD"),
  checkOut: z.string().describe("Fecha salida YYYY-MM-DD"),
});

async function executeCheckAvailability(args: z.infer<typeof CheckAvailabilitySchema>): Promise<ToolResult> {
  try {
    const checkIn = new Date(args.checkIn);
    const checkOut = new Date(args.checkOut);

    const blocked = await db.availability.count({
      where: {
        fincaId: args.fincaId,
        date: { gte: checkIn, lt: checkOut },
        status: { in: ["BLOCKED", "RESERVED", "MAINTENANCE"] },
      },
    });

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    return {
      success: true,
      data: {
        available: blocked === 0,
        nights,
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        message: blocked === 0 ? "✅ Fechas disponibles" : "❌ No disponible para esas fechas",
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error verificando disponibilidad" };
  }
}

// 3. get_finca_details
const GetFincaDetailsSchema = z.object({
  fincaId: z.string().optional().describe("ID de la finca"),
  slug: z.string().optional().describe("Slug de la finca"),
});

async function executeGetFincaDetails(args: z.infer<typeof GetFincaDetailsSchema>): Promise<ToolResult> {
  try {
    const finca = await db.finca.findFirst({
      where: args.fincaId ? { id: args.fincaId } : { slug: args.slug },
      include: {
        images: { orderBy: { order: "asc" }, take: 5 },
        reviews: {
          where: { publishedAt: { not: null } },
          take: 3,
          include: { client: { select: { name: true } } },
        },
      },
    });

    if (!finca) return { success: false, error: "Finca no encontrada" };

    const avgRating =
      finca.reviews.length > 0
        ? Math.round((finca.reviews.reduce((s, r) => s + r.rating, 0) / finca.reviews.length) * 10) / 10
        : null;

    return {
      success: true,
      data: {
        id: finca.id,
        slug: finca.slug,
        name: finca.name,
        municipality: finca.municipality,
        department: finca.department,
        description: finca.description,
        capacity: finca.capacity,
        bedrooms: finca.bedrooms,
        bathrooms: finca.bathrooms,
        pricePerNight: finca.pricePerNight,
        weekendPrice: finca.weekendPrice,
        holidayPrice: finca.holidayPrice,
        minNights: finca.minNights,
        checkInTime: finca.checkInTime,
        checkOutTime: finca.checkOutTime,
        amenities: finca.amenities,
        cancellationPolicy: finca.cancellationPolicy,
        rules: finca.rules,
        images: finca.images.map((i) => i.url),
        avgRating,
        recentReviews: finca.reviews.map((r) => ({
          rating: r.rating,
          comment: r.comment,
          clientName: r.client.name,
        })),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error obteniendo detalles" };
  }
}

// 4. get_quote
const GetQuoteSchema = z.object({
  fincaId: z.string().describe("ID de la finca"),
  checkIn: z.string().describe("Fecha entrada YYYY-MM-DD"),
  checkOut: z.string().describe("Fecha salida YYYY-MM-DD"),
  adults: z.number().min(1),
  children: z.number().min(0).default(0),
  couponCode: z.string().optional().describe("Código de cupón a aplicar"),
});

async function executeGetQuote(args: z.infer<typeof GetQuoteSchema>): Promise<ToolResult> {
  try {
    const finca = await db.finca.findUnique({ where: { id: args.fincaId } });
    if (!finca) return { success: false, error: "Finca no encontrada" };

    const checkIn = new Date(args.checkIn);
    const checkOut = new Date(args.checkOut);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    if (nights < finca.minNights) {
      return {
        success: false,
        error: `Esta finca requiere mínimo ${finca.minNights} noches`,
      };
    }

    const isWeekend = checkIn.getDay() === 5 || checkIn.getDay() === 6;
    const pricePerNight = (isWeekend && finca.weekendPrice) || finca.pricePerNight;
    const basePrice = pricePerNight * nights;
    const platformFee = Math.round(basePrice * 0.08);
    let discountAmount = 0;
    let couponApplied = false;

    if (args.couponCode) {
      const coupon = await db.coupon.findFirst({
        where: { code: args.couponCode, active: true },
      });
      if (coupon) {
        discountAmount =
          coupon.discountType === "PERCENT"
            ? Math.round(basePrice * (coupon.discountValue / 100))
            : coupon.discountValue;
        couponApplied = true;
      }
    }

    const totalPrice = basePrice + platformFee - discountAmount;

    return {
      success: true,
      data: {
        fincaName: finca.name,
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        nights,
        guests: args.adults + args.children,
        pricePerNight: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(pricePerNight),
        basePrice: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(basePrice),
        platformFee: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(platformFee),
        discountAmount: discountAmount > 0 ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(discountAmount) : null,
        totalPrice: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalPrice),
        totalPriceRaw: totalPrice,
        couponApplied,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error calculando cotización" };
  }
}

// 5. get_similar_fincas
const GetSimilarFincasSchema = z.object({
  fincaId: z.string().describe("ID de la finca de referencia"),
  limit: z.number().default(3),
});

async function executeGetSimilarFincas(args: z.infer<typeof GetSimilarFincasSchema>): Promise<ToolResult> {
  try {
    const finca = await db.finca.findUnique({ where: { id: args.fincaId } });
    if (!finca) return { success: false, error: "Finca no encontrada" };

    const similar = await db.finca.findMany({
      where: {
        id: { not: finca.id },
        status: "ACTIVE",
        municipality: finca.municipality,
        capacity: { gte: Math.max(1, finca.capacity - 4), lte: finca.capacity + 4 },
      },
      include: { images: { where: { isPrimary: true }, take: 1 } },
      take: args.limit,
    });

    if (similar.length < args.limit) {
      const more = await db.finca.findMany({
        where: {
          id: { notIn: [finca.id, ...similar.map((s) => s.id)] },
          status: "ACTIVE",
          department: finca.department,
        },
        include: { images: { where: { isPrimary: true }, take: 1 } },
        take: args.limit - similar.length,
      });
      similar.push(...more);
    }

    return {
      success: true,
      data: similar.map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        municipality: f.municipality,
        capacity: f.capacity,
        pricePerNight: f.pricePerNight,
        imageUrl: f.images[0]?.url,
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error buscando similares" };
  }
}

// 6. create_reservation
const CreateReservationSchema = z.object({
  fincaId: z.string(),
  clientName: z.string().describe("Nombre completo del cliente"),
  clientEmail: z.string().email().describe("Email del cliente"),
  clientPhone: z.string().describe("Teléfono del cliente con indicativo +57"),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().min(1),
  children: z.number().min(0).default(0),
  specialRequests: z.string().optional(),
  couponCode: z.string().optional(),
});

async function executeCreateReservation(args: z.infer<typeof CreateReservationSchema>): Promise<ToolResult> {
  try {
    // Find or create user
    let user = await db.user.findFirst({ where: { email: args.clientEmail } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: args.clientEmail,
          name: args.clientName,
          phone: args.clientPhone,
          role: "CLIENTE",
          profile: { create: {} },
        },
      });
    }

    const finca = await db.finca.findUnique({ where: { id: args.fincaId } });
    if (!finca) return { success: false, error: "Finca no encontrada" };

    const checkIn = new Date(args.checkIn);
    const checkOut = new Date(args.checkOut);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    const isWeekend = checkIn.getDay() === 5 || checkIn.getDay() === 6;
    const pricePerNight = (isWeekend && finca.weekendPrice) || finca.pricePerNight;
    const basePrice = pricePerNight * nights;
    const platformFee = Math.round(basePrice * 0.08);

    let discountAmount = 0;
    let couponId: string | undefined;
    if (args.couponCode) {
      const coupon = await db.coupon.findFirst({ where: { code: args.couponCode, active: true } });
      if (coupon) {
        discountAmount = coupon.discountType === "PERCENT"
          ? Math.round(basePrice * (coupon.discountValue / 100))
          : coupon.discountValue;
        couponId = coupon.id;
        await db.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    const totalPrice = basePrice + platformFee - discountAmount;

    const reservation = await db.reservation.create({
      data: {
        fincaId: args.fincaId,
        clientId: user.id,
        checkIn,
        checkOut,
        nights,
        adults: args.adults,
        children: args.children,
        basePrice,
        platformFeePercent: 0.08,
        platformFee,
        ownerPayout: basePrice - platformFee,
        totalPrice,
        discountAmount,
        couponId,
        cancellationPolicy: finca.cancellationPolicy,
        specialRequests: args.specialRequests,
        status: "PENDING_PAYMENT",
      },
    });

    return {
      success: true,
      data: {
        reservationId: reservation.id,
        totalPrice,
        totalPriceFormatted: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalPrice),
        message: "Reserva creada exitosamente. Procede al pago para confirmarla.",
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error creando reserva" };
  }
}

// 7. apply_coupon
const ApplyCouponSchema = z.object({
  code: z.string().describe("Código del cupón"),
  orderAmount: z.number().describe("Monto base de la reserva en COP"),
});

async function executeApplyCoupon(args: z.infer<typeof ApplyCouponSchema>): Promise<ToolResult> {
  try {
    const coupon = await db.coupon.findFirst({
      where: {
        code: args.code.toUpperCase(),
        active: true,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { OR: [{ maxUses: null }, { usedCount: { lt: db.coupon.fields.maxUses as unknown as number } }] },
        ],
      },
    });

    if (!coupon) {
      return { success: false, error: "Cupón inválido, expirado o agotado" };
    }

    if (coupon.minOrderAmount && args.orderAmount < coupon.minOrderAmount) {
      return {
        success: false,
        error: `El monto mínimo para este cupón es ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(coupon.minOrderAmount)}`,
      };
    }

    const discount =
      coupon.discountType === "PERCENT"
        ? Math.round(args.orderAmount * (coupon.discountValue / 100))
        : coupon.discountValue;

    return {
      success: true,
      data: {
        valid: true,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: discount,
        discountFormatted: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(discount),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error aplicando cupón" };
  }
}

// 8. send_payment_link
const SendPaymentLinkSchema = z.object({
  reservationId: z.string().describe("ID de la reserva"),
  channel: z.string().describe("Canal por donde enviar el link: WHATSAPP, INSTAGRAM, WEB"),
  phone: z.string().optional().describe("Teléfono para WhatsApp"),
});

async function executeSendPaymentLink(args: z.infer<typeof SendPaymentLinkSchema>): Promise<ToolResult> {
  try {
    const reservation = await db.reservation.findUnique({
      where: { id: args.reservationId },
      include: { finca: true },
    });

    if (!reservation) return { success: false, error: "Reserva no encontrada" };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depaseoenfincas.co";
    const paymentUrl = `${baseUrl}/reservar/${reservation.id}?step=payment`;

    return {
      success: true,
      data: {
        paymentUrl,
        reservationId: reservation.id,
        totalPrice: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(reservation.totalPrice),
        fincaName: reservation.finca.name,
        message: `Haz clic aquí para pagar tu reserva en ${reservation.finca.name}: ${paymentUrl}`,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error generando link de pago" };
  }
}

// 9. add_to_calendar
const AddToCalendarSchema = z.object({
  reservationId: z.string().describe("ID de la reserva"),
  userId: z.string().optional().describe("ID del usuario (para Google Calendar)"),
});

async function executeAddToCalendar(args: z.infer<typeof AddToCalendarSchema>): Promise<ToolResult> {
  try {
    const reservation = await db.reservation.findUnique({
      where: { id: args.reservationId },
      include: { finca: true },
    });

    if (!reservation) return { success: false, error: "Reserva no encontrada" };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depaseoenfincas.co";
    const icalUrl = `${baseUrl}/api/calendar/${reservation.id}.ics`;

    return {
      success: true,
      data: {
        icalUrl,
        googleCalendarUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Paseo en ${reservation.finca.name}`)}&dates=${reservation.checkIn.toISOString().slice(0, 10).replace(/-/g, "")}/${reservation.checkOut.toISOString().slice(0, 10).replace(/-/g, "")}&details=${encodeURIComponent(`Reserva en ${reservation.finca.name}, ${reservation.finca.municipality}`)}`,
        message: "Puedes agregar esta reserva a tu calendario con el link adjunto",
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error generando evento de calendario" };
  }
}

// 10. get_reservation_status
const GetReservationStatusSchema = z.object({
  reservationId: z.string().optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
});

async function executeGetReservationStatus(args: z.infer<typeof GetReservationStatusSchema>): Promise<ToolResult> {
  try {
    let reservations;

    if (args.reservationId) {
      const r = await db.reservation.findUnique({
        where: { id: args.reservationId },
        include: { finca: { select: { name: true, municipality: true } } },
      });
      reservations = r ? [r] : [];
    } else {
      const user = await db.user.findFirst({
        where: {
          OR: [
            ...(args.clientEmail ? [{ email: args.clientEmail }] : []),
            ...(args.clientPhone ? [{ phone: args.clientPhone }] : []),
          ],
        },
      });
      if (!user) return { success: false, error: "Cliente no encontrado" };

      reservations = await db.reservation.findMany({
        where: { clientId: user.id },
        include: { finca: { select: { name: true, municipality: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    }

    return {
      success: true,
      data: reservations.map((r) => ({
        id: r.id,
        finca: r.finca.name,
        municipality: r.finca.municipality,
        checkIn: r.checkIn.toISOString().slice(0, 10),
        checkOut: r.checkOut.toISOString().slice(0, 10),
        nights: r.nights,
        status: r.status,
        totalPrice: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(r.totalPrice),
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error obteniendo estado de reserva" };
  }
}

// 11. modify_reservation
const ModifyReservationSchema = z.object({
  reservationId: z.string(),
  newCheckIn: z.string().optional(),
  newCheckOut: z.string().optional(),
  adults: z.number().optional(),
  children: z.number().optional(),
  specialRequests: z.string().optional(),
});

async function executeModifyReservation(args: z.infer<typeof ModifyReservationSchema>): Promise<ToolResult> {
  try {
    const reservation = await db.reservation.findUnique({ where: { id: args.reservationId } });
    if (!reservation) return { success: false, error: "Reserva no encontrada" };

    if (!["PENDING_PAYMENT", "CONFIRMED"].includes(reservation.status)) {
      return { success: false, error: "Esta reserva no puede modificarse en su estado actual" };
    }

    const updateData: Record<string, unknown> = {};
    if (args.newCheckIn) updateData.checkIn = new Date(args.newCheckIn);
    if (args.newCheckOut) updateData.checkOut = new Date(args.newCheckOut);
    if (args.adults !== undefined) updateData.adults = args.adults;
    if (args.children !== undefined) updateData.children = args.children;
    if (args.specialRequests) updateData.specialRequests = args.specialRequests;

    if (args.newCheckIn && args.newCheckOut) {
      const checkIn = new Date(args.newCheckIn);
      const checkOut = new Date(args.newCheckOut);
      updateData.nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    }

    const updated = await db.reservation.update({
      where: { id: args.reservationId },
      data: updateData as Parameters<typeof db.reservation.update>[0]["data"],
    });

    return { success: true, data: { message: "Reserva actualizada exitosamente", reservationId: updated.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error modificando reserva" };
  }
}

// 12. cancel_reservation
const CancelReservationSchema = z.object({
  reservationId: z.string(),
  reason: z.string().describe("Motivo de la cancelación"),
});

async function executeCancelReservation(args: z.infer<typeof CancelReservationSchema>): Promise<ToolResult> {
  try {
    const reservation = await db.reservation.findUnique({ where: { id: args.reservationId } });
    if (!reservation) return { success: false, error: "Reserva no encontrada" };

    if (reservation.status === "CANCELLED") {
      return { success: false, error: "Esta reserva ya está cancelada" };
    }

    await db.reservation.update({
      where: { id: args.reservationId },
      data: { status: "CANCELLED", cancellationReason: args.reason },
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

    return {
      success: true,
      data: { message: "Reserva cancelada. El reembolso se procesará según la política de cancelación." },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error cancelando reserva" };
  }
}

// 13. get_faq_answer
const GetFaqAnswerSchema = z.object({
  question: z.string().describe("Pregunta del usuario"),
});

async function executeGetFaqAnswer(args: z.infer<typeof GetFaqAnswerSchema>): Promise<ToolResult> {
  try {
    // Simple keyword search as fallback (RAG would be better)
    const keywords = args.question.toLowerCase().split(" ").filter((w) => w.length > 3);

    const chunks = await db.knowledgeChunk.findMany({
      where: {
        type: { in: ["FAQ", "POLICY"] },
      },
      take: 20,
    });

    const scored = chunks
      .map((chunk) => {
        const score = keywords.filter((kw) =>
          chunk.content.toLowerCase().includes(kw)
        ).length;
        return { ...chunk, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length === 0) {
      return {
        success: true,
        data: {
          answer: "No encontré una respuesta específica a esa pregunta. Te recomiendo contactar a nuestro equipo o visitar la sección de ayuda en la web.",
          sources: [],
        },
      };
    }

    return {
      success: true,
      data: {
        answer: scored[0].content,
        relatedAnswers: scored.slice(1).map((c) => c.content),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error buscando respuesta" };
  }
}

// 14. send_reminder
const SendReminderSchema = z.object({
  reservationId: z.string(),
  reminderType: z.enum(["pre_trip_info", "logistics", "checkin_now", "post_stay"]),
});

async function executeSendReminder(args: z.infer<typeof SendReminderSchema>): Promise<ToolResult> {
  try {
    const reservation = await db.reservation.findUnique({
      where: { id: args.reservationId },
      include: { client: true, finca: true },
    });

    if (!reservation) return { success: false, error: "Reserva no encontrada" };

    await db.notification.create({
      data: {
        userId: reservation.clientId,
        type: args.reminderType,
        title: `Recordatorio: ${reservation.finca.name}`,
        body: `Recordatorio de tipo ${args.reminderType} para tu reserva en ${reservation.finca.name}`,
        channel: reservation.client.preferredChannel || "EMAIL",
        scheduledAt: new Date(),
        metadata: { reservationId: reservation.id },
      },
    });

    return { success: true, data: { message: `Recordatorio ${args.reminderType} programado para ${reservation.client.name}` } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error enviando recordatorio" };
  }
}

// 15. escalate_to_advisor
const EscalateToAdvisorSchema = z.object({
  sessionId: z.string().describe("ID de la sesión del bot"),
  reason: z.string().describe("Motivo del escalamiento"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

async function executeEscalateToAdvisor(args: z.infer<typeof EscalateToAdvisorSchema>): Promise<ToolResult> {
  try {
    const session = await db.botSession.findUnique({ where: { id: args.sessionId } });
    if (!session) return { success: false, error: "Sesión no encontrada" };

    await db.botSession.update({
      where: { id: args.sessionId },
      data: { state: "ESCALATED" },
    });

    // Create or update lead
    const entities = session.extractedEntities as Record<string, unknown>;
    const existingLead = await db.lead.findUnique({ where: { sessionId: args.sessionId } });

    if (!existingLead) {
      await db.lead.create({
        data: {
          sessionId: args.sessionId,
          clientName: (entities.name as string) || "Cliente sin nombre",
          clientPhone: entities.phone as string,
          clientEmail: entities.email as string,
          source: session.channel as "WHATSAPP" | "INSTAGRAM" | "WEB" | "REFERRAL",
          status: "NEW",
          municipality: entities.municipality as string,
          notes: `Escalado por bot: ${args.reason}`,
        },
      });
    }

    return {
      success: true,
      data: {
        escalated: true,
        message: "Te estoy conectando con un asesor humano. En breve alguien de nuestro equipo te atenderá 🤝",
        waitTime: "Tiempo estimado de espera: 5-10 minutos en horario laboral",
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error escalando a asesor" };
  }
}

// ─── Tool registry ────────────────────────────────────────────────────────────
export interface Tool {
  definition: LLMTool;
  execute: (args: unknown) => Promise<ToolResult>;
}

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    if (value instanceof z.ZodOptional) {
      const inner = value.unwrap();
      properties[key] = getJsonSchemaType(inner);
    } else {
      properties[key] = getJsonSchemaType(value as z.ZodTypeAny);
      if (!(value instanceof z.ZodDefault)) required.push(key);
    }
  }

  return { type: "object", properties, required };
}

function getJsonSchemaType(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodString) return { type: "string", description: (schema as z.ZodString & { description?: string }).description };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodArray) return { type: "array", items: getJsonSchemaType(schema.element) };
  if (schema instanceof z.ZodDefault) return getJsonSchemaType(schema._def.innerType);
  if (schema instanceof z.ZodOptional) return getJsonSchemaType(schema.unwrap());
  return { type: "string" };
}

function makeTool<T extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  schema: T,
  execute: (args: z.infer<T>) => Promise<ToolResult>
): Tool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description,
        parameters: zodToJsonSchema(schema),
      },
    },
    execute: async (args: unknown) => {
      const parsed = schema.parse(args);
      return execute(parsed);
    },
  };
}

export const TOOLS: Tool[] = [
  makeTool("search_fincas", "Busca fincas disponibles según los criterios del cliente (municipio, fechas, personas, presupuesto, amenidades)", SearchFincasSchema, executeSearchFincas),
  makeTool("check_availability", "Verifica si una finca está disponible para fechas específicas", CheckAvailabilitySchema, executeCheckAvailability),
  makeTool("get_finca_details", "Obtiene información completa de una finca: amenidades, reglas, reseñas, fotos", GetFincaDetailsSchema, executeGetFincaDetails),
  makeTool("get_quote", "Calcula el precio total de una reserva incluyendo tarifa de servicio y descuentos", GetQuoteSchema, executeGetQuote),
  makeTool("get_similar_fincas", "Busca fincas similares a una dada (mismo municipio, capacidad similar)", GetSimilarFincasSchema, executeGetSimilarFincas),
  makeTool("create_reservation", "Crea una reserva pre-confirmada que requiere pago", CreateReservationSchema, executeCreateReservation),
  makeTool("apply_coupon", "Valida y aplica un código de cupón de descuento", ApplyCouponSchema, executeApplyCoupon),
  makeTool("send_payment_link", "Genera y envía el link de pago Wompi al cliente", SendPaymentLinkSchema, executeSendPaymentLink),
  makeTool("add_to_calendar", "Agrega la reserva al calendario (Google Calendar o iCal)", AddToCalendarSchema, executeAddToCalendar),
  makeTool("get_reservation_status", "Consulta el estado de una o más reservas de un cliente", GetReservationStatusSchema, executeGetReservationStatus),
  makeTool("modify_reservation", "Modifica las fechas, personas o solicitudes especiales de una reserva", ModifyReservationSchema, executeModifyReservation),
  makeTool("cancel_reservation", "Cancela una reserva y libera la disponibilidad de la finca", CancelReservationSchema, executeCancelReservation),
  makeTool("get_faq_answer", "Busca respuesta a preguntas frecuentes sobre la plataforma", GetFaqAnswerSchema, executeGetFaqAnswer),
  makeTool("send_reminder", "Programa o envía recordatorios al cliente sobre su reserva", SendReminderSchema, executeSendReminder),
  makeTool("escalate_to_advisor", "Escala la conversación a un asesor humano cuando el bot no puede resolver", EscalateToAdvisorSchema, executeEscalateToAdvisor),
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.definition.function.name, t]));
export const TOOL_DEFINITIONS: LLMTool[] = TOOLS.map((t) => t.definition);
