import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@repo/db";
import type { Prisma } from "@prisma/client";

// ─── Context ──────────────────────────────────────────────────────────────────
export interface SessionUser {
  id: string;
  email: string;
  role: string;
  name?: string | null;
}

export interface TRPCContext {
  req?: Request;
  session?: {
    user?: SessionUser;
  } | null;
}

export interface AuthContext extends TRPCContext {
  session: { user: SessionUser };
}

export async function createTRPCContext(opts: {
  req?: Request;
  session?: TRPCContext["session"];
}): Promise<TRPCContext> {
  return {
    req: opts.req,
    session: opts.session,
  };
}

// ─── Init tRPC ────────────────────────────────────────────────────────────────
const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = ctx.session.user;
  return next({ ctx: { ...ctx, session: { user } } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = ctx.session.user;
  if (user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Se requiere rol ADMIN" });
  }
  return next({ ctx: { ...ctx, session: { user } } });
});

export const advisorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = ctx.session.user;
  if (!["ASESOR", "ADMIN"].includes(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Se requiere rol ASESOR o ADMIN" });
  }
  return next({ ctx: { ...ctx, session: { user } } });
});

// ─── Fincas Router ────────────────────────────────────────────────────────────
const fincasRouter = router({
  search: publicProcedure
    .input(
      z.object({
        municipality: z.string().optional(),
        department: z.string().optional(),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        adults: z.number().min(1).optional(),
        children: z.number().min(0).optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        amenities: z.array(z.string()).optional(),
        page: z.number().default(1),
        pageSize: z.number().default(12),
      })
    )
    .query(async ({ input }) => {
      const {
        municipality,
        department,
        checkIn,
        checkOut,
        adults,
        children,
        minPrice,
        maxPrice,
        amenities,
        page,
        pageSize,
      } = input;

      const totalGuests = (adults ?? 1) + (children ?? 0);

      const where: Prisma.FincaWhereInput = {
        status: "ACTIVE",
        ...(municipality && { municipality: { contains: municipality, mode: "insensitive" } }),
        ...(department && { department: { contains: department, mode: "insensitive" } }),
        ...(totalGuests > 0 && { capacity: { gte: totalGuests } }),
        ...(minPrice != null && { pricePerNight: { gte: minPrice } }),
        ...(maxPrice != null && { pricePerNight: { lte: maxPrice } }),
        ...(amenities?.length && { amenities: { hasEvery: amenities } }),
      };

      if (checkIn && checkOut) {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const blockedFincaIds = await db.availability.findMany({
          where: {
            date: { gte: checkInDate, lt: checkOutDate },
            status: { in: ["BLOCKED", "RESERVED", "MAINTENANCE"] },
          },
          select: { fincaId: true },
          distinct: ["fincaId"],
        });
        const blockedIds = blockedFincaIds.map((a) => a.fincaId);
        if (blockedIds.length > 0) {
          where.id = { notIn: blockedIds };
        }
      }

      const [items, total] = await Promise.all([
        db.finca.findMany({
          where,
          include: {
            images: { where: { isPrimary: true }, take: 1 },
            reviews: { select: { rating: true } },
          },
          orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.finca.count({ where }),
      ]);

      return {
        items: items.map((f) => ({
          ...f,
          avgRating:
            f.reviews.length > 0
              ? f.reviews.reduce((sum, r) => sum + r.rating, 0) / f.reviews.length
              : null,
          reviewCount: f.reviews.length,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const finca = await db.finca.findUnique({
        where: { slug: input.slug },
        include: {
          images: { orderBy: { order: "asc" } },
          owner: { select: { name: true, image: true } },
          reviews: {
            where: { publishedAt: { not: null } },
            include: { client: { select: { name: true, image: true } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!finca) throw new TRPCError({ code: "NOT_FOUND" });

      const avgRating =
        finca.reviews.length > 0
          ? finca.reviews.reduce((sum, r) => sum + r.rating, 0) / finca.reviews.length
          : null;

      return { ...finca, avgRating, reviewCount: finca.reviews.length };
    }),

  featured: publicProcedure.query(async () => {
    return db.finca.findMany({
      where: { status: "ACTIVE", featured: true },
      include: { images: { where: { isPrimary: true }, take: 1 } },
      take: 6,
    });
  }),

  availability: publicProcedure
    .input(
      z.object({
        fincaId: z.string(),
        month: z.number().min(0).max(11),
        year: z.number().min(2024),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.year, input.month, 1);
      const endDate = new Date(input.year, input.month + 1, 0);

      return db.availability.findMany({
        where: {
          fincaId: input.fincaId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "asc" },
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(3),
        slug: z.string().min(3),
        description: z.string().min(20),
        shortDescription: z.string().min(10),
        municipality: z.string(),
        department: z.string(),
        lat: z.number(),
        lng: z.number(),
        capacity: z.number().min(1),
        bedrooms: z.number().min(1),
        bathrooms: z.number().min(1),
        pricePerNight: z.number().min(1),
        ownerId: z.string(),
        amenities: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input }) => {
      return db.finca.create({ data: input });
    }),

  update: adminProcedure
    .input(z.object({ id: z.string(), data: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input }) => {
      return db.finca.update({
        where: { id: input.id },
        data: input.data as Prisma.FincaUpdateInput,
      });
    }),
});

// ─── Reservations Router ──────────────────────────────────────────────────────
const reservationsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        fincaId: z.string(),
        checkIn: z.string(),
        checkOut: z.string(),
        adults: z.number().min(1),
        children: z.number().default(0),
        specialRequests: z.string().optional(),
        couponCode: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const clientId = ctx.session.user.id;
      const checkIn = new Date(input.checkIn);
      const checkOut = new Date(input.checkOut);
      const nights = Math.ceil(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );

      const finca = await db.finca.findUnique({ where: { id: input.fincaId } });
      if (!finca) throw new TRPCError({ code: "NOT_FOUND", message: "Finca no encontrada" });

      const isWeekend = checkIn.getDay() === 5 || checkIn.getDay() === 6;
      const pricePerNight =
        (isWeekend && finca.weekendPrice) ? finca.weekendPrice : finca.pricePerNight;
      const basePrice = pricePerNight * nights;
      const platformFeePercent = 0.08;
      const platformFee = Math.round(basePrice * platformFeePercent);
      const ownerPayout = basePrice - platformFee;

      let discountAmount = 0;
      let couponId: string | undefined;

      if (input.couponCode) {
        const coupon = await db.coupon.findFirst({
          where: { code: input.couponCode, active: true },
        });
        if (coupon) {
          discountAmount =
            coupon.discountType === "PERCENT"
              ? Math.round(basePrice * (coupon.discountValue / 100))
              : coupon.discountValue;
          couponId = coupon.id;
        }
      }

      const totalPrice = basePrice + platformFee - discountAmount;

      return db.reservation.create({
        data: {
          fincaId: input.fincaId,
          clientId,
          checkIn,
          checkOut,
          nights,
          adults: input.adults,
          children: input.children,
          basePrice,
          platformFeePercent,
          platformFee,
          ownerPayout,
          totalPrice,
          discountAmount,
          couponId,
          cancellationPolicy: finca.cancellationPolicy,
          specialRequests: input.specialRequests,
        },
        include: { finca: { include: { images: { where: { isPrimary: true }, take: 1 } } } },
      });
    }),

  myReservations: protectedProcedure.query(async ({ ctx }) => {
    return db.reservation.findMany({
      where: { clientId: ctx.session.user.id },
      include: {
        finca: { include: { images: { where: { isPrimary: true }, take: 1 } } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const reservation = await db.reservation.findUnique({
        where: { id: input.id },
        include: {
          finca: { include: { images: { orderBy: { order: "asc" } } } },
          client: { select: { name: true, email: true, phone: true } },
          payments: true,
          coupon: true,
        },
      });

      if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, role } = ctx.session.user;
      if (
        reservation.clientId !== id &&
        reservation.advisorId !== id &&
        !["ADMIN", "ASESOR"].includes(role)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return reservation;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(10) }))
    .mutation(async ({ input, ctx }) => {
      const reservation = await db.reservation.findUnique({ where: { id: input.id } });
      if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, role } = ctx.session.user;
      if (reservation.clientId !== id && !["ADMIN", "ASESOR"].includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return db.reservation.update({
        where: { id: input.id },
        data: { status: "CANCELLED", cancellationReason: input.reason },
      });
    }),

  all: advisorProcedure
    .input(
      z.object({
        status: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.ReservationWhereInput = input.status
        ? { status: input.status as Prisma.EnumReservationStatusFilter["equals"] }
        : {};
      const [items, total] = await Promise.all([
        db.reservation.findMany({
          where,
          include: {
            finca: true,
            client: { select: { name: true, email: true, phone: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        db.reservation.count({ where }),
      ]);
      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),
});

// ─── Users Router ─────────────────────────────────────────────────────────────
const usersRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: { profile: true },
    });
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        profile: z
          .object({
            budgetMin: z.number().optional(),
            budgetMax: z.number().optional(),
            typicalGroupSize: z.number().optional(),
            municipalityPreferences: z.array(z.string()).optional(),
            favoriteAmenities: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { profile, ...userFields } = input;
      const userId = ctx.session.user.id;
      await db.user.update({ where: { id: userId }, data: userFields });
      if (profile) {
        await db.userProfile.upsert({
          where: { userId },
          update: profile,
          create: { userId, ...profile },
        });
      }
      return db.user.findUnique({ where: { id: userId }, include: { profile: true } });
    }),

  all: adminProcedure
    .input(
      z.object({
        role: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.UserWhereInput = input.role
        ? { role: input.role as Prisma.EnumUserRoleFilter["equals"] }
        : {};
      const [items, total] = await Promise.all([
        db.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isOnline: true,
            createdAt: true,
          },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        db.user.count({ where }),
      ]);
      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),
});

// ─── Bot Router ───────────────────────────────────────────────────────────────
const botRouter = router({
  getSession: publicProcedure
    .input(z.object({ channel: z.string(), externalId: z.string() }))
    .query(async ({ input }) => {
      return db.botSession.findUnique({
        where: {
          channel_externalId: {
            channel: input.channel as "WHATSAPP" | "INSTAGRAM" | "WEB" | "EMAIL",
            externalId: input.externalId,
          },
        },
        include: { botMessages: { orderBy: { createdAt: "asc" }, take: 50 } },
      });
    }),

  getMessages: publicProcedure
    .input(z.object({ sessionId: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return db.botMessage.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});

// ─── Leads Router ─────────────────────────────────────────────────────────────
const leadsRouter = router({
  all: advisorProcedure
    .input(
      z.object({
        status: z.string().optional(),
        advisorId: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: Prisma.LeadWhereInput = {};
      if (input.status) where.status = input.status as Prisma.EnumLeadStatusFilter["equals"];
      if (ctx.session.user.role === "ASESOR") {
        where.advisorId = ctx.session.user.id;
      } else if (input.advisorId) {
        where.advisorId = input.advisorId;
      }

      const [items, total] = await Promise.all([
        db.lead.findMany({
          where,
          include: { advisor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        db.lead.count({ where }),
      ]);
      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  updateStatus: advisorProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return db.lead.update({
        where: { id: input.id },
        data: {
          status: input.status as Prisma.EnumLeadStatusFilter["equals"],
          notes: input.notes,
          ...((input.status === "CLOSED_WON" || input.status === "CLOSED_LOST")
            ? { closedAt: new Date() }
            : {}),
        },
      });
    }),

  assign: adminProcedure
    .input(z.object({ id: z.string(), advisorId: z.string() }))
    .mutation(async ({ input }) => {
      return db.lead.update({
        where: { id: input.id },
        data: { advisorId: input.advisorId, assignedAt: new Date() },
      });
    }),
});

// ─── Admin Router ─────────────────────────────────────────────────────────────
const adminRouter = router({
  metrics: adminProcedure.query(async () => {
    const [totalFincas, activeFincas, reservationsThisMonth, totalLeads, newLeads] =
      await Promise.all([
        db.finca.count(),
        db.finca.count({ where: { status: "ACTIVE" } }),
        db.reservation.count({
          where: {
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
            status: { notIn: ["CANCELLED"] },
          },
        }),
        db.lead.count(),
        db.lead.count({ where: { status: "NEW" } }),
      ]);

    const revenueResult = await db.reservation.aggregate({
      where: {
        status: { in: ["CONFIRMED", "COMPLETED"] },
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { totalPrice: true },
    });

    return {
      totalFincas,
      activeFincas,
      reservationsThisMonth,
      totalLeads,
      newLeads,
      revenueThisMonth: revenueResult._sum.totalPrice ?? 0,
    };
  }),

  getBotConfig: adminProcedure.query(async () => {
    return db.botConfig.findMany({ orderBy: { category: "asc" } });
  }),

  updateBotConfig: adminProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ input, ctx }) => {
      return db.botConfig.upsert({
        where: { key: input.key },
        update: {
          value: input.value as Prisma.InputJsonValue,
          updatedBy: ctx.session.user.id,
        },
        create: {
          key: input.key,
          value: input.value as Prisma.InputJsonValue,
          updatedBy: ctx.session.user.id,
        },
      });
    }),

  getAssignmentWeights: adminProcedure.query(async () => {
    return db.assignmentWeights.findUnique({ where: { id: "singleton" } });
  }),

  updateAssignmentWeights: adminProcedure
    .input(
      z.object({
        municipalityMatchPts: z.number().optional(),
        penaltyPerActiveLead: z.number().optional(),
        scheduleAvailablePts: z.number().optional(),
        conversionRateMultiplier: z.number().optional(),
        responseTimePenaltyPerHour: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return db.assignmentWeights.update({
        where: { id: "singleton" },
        data: input,
      });
    }),
});

// ─── Municipalities Router ────────────────────────────────────────────────────
const municipalitiesRouter = router({
  all: publicProcedure
    .input(z.object({ department: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.municipality.findMany({
        where: {
          active: true,
          ...(input?.department && { department: input.department }),
        },
        orderBy: { name: "asc" },
      });
    }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return db.municipality.findUnique({ where: { slug: input.slug } });
    }),
});

// ─── Root Router ──────────────────────────────────────────────────────────────
export const appRouter = router({
  fincas: fincasRouter,
  reservations: reservationsRouter,
  users: usersRouter,
  bot: botRouter,
  leads: leadsRouter,
  admin: adminRouter,
  municipalities: municipalitiesRouter,
});

export type AppRouter = typeof appRouter;
