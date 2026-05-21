import { db } from "@repo/db";

export interface AdvisorScore {
  advisorId: string;
  score: number;
  reasons: string[];
}

export interface AssignmentResult {
  advisorId: string;
  score: number;
  reasons: string[];
}

export async function assignAdvisor(opts: {
  municipality?: string;
  sessionId?: string;
  leadId?: string;
}): Promise<AssignmentResult | null> {
  // Load weights from DB (singleton row)
  const weights = await db.assignmentWeights.findUnique({ where: { id: "singleton" } });

  if (!weights) {
    console.error("[Assignment] AssignmentWeights not found in DB");
    return null;
  }

  // Get all online advisors
  const advisors = await db.user.findMany({
    where: { role: "ASESOR", isOnline: true },
    include: {
      profile: true,
      leads: {
        where: { status: { in: ["NEW", "CONTACTED", "NEGOTIATING"] } },
        select: { id: true },
      },
    },
  });

  if (advisors.length === 0) {
    // Fallback: get any ASESOR
    const fallbackAdvisors = await db.user.findMany({
      where: { role: "ASESOR" },
      include: {
        profile: true,
        leads: {
          where: { status: { in: ["NEW", "CONTACTED", "NEGOTIATING"] } },
          select: { id: true },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 3,
    });

    if (fallbackAdvisors.length === 0) return null;
    advisors.push(...fallbackAdvisors);
  }

  // Calculate score for each advisor
  const scores: AdvisorScore[] = await Promise.all(
    advisors.map(async (advisor) => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Municipality match
      if (
        opts.municipality &&
        advisor.profile?.municipalityPreferences?.some((m) =>
          m.toLowerCase().includes(opts.municipality!.toLowerCase())
        )
      ) {
        score += weights.municipalityMatchPts;
        reasons.push(`+${weights.municipalityMatchPts} municipio coincide (${opts.municipality})`);
      }

      // 2. Active leads penalty (workload)
      const activeleads = advisor.leads.length;
      const penalty = activeleads * weights.penaltyPerActiveLead;
      score -= penalty;
      if (activeleads > 0) {
        reasons.push(`-${penalty} por ${activeleads} leads activos`);
      }

      // 3. Schedule available bonus
      if (advisor.isOnline) {
        score += weights.scheduleAvailablePts;
        reasons.push(`+${weights.scheduleAvailablePts} en línea`);
      }

      // 4. Conversion rate multiplier
      const closedWon = await db.lead.count({
        where: { advisorId: advisor.id, status: "CLOSED_WON" },
      });
      const totalClosed = await db.lead.count({
        where: {
          advisorId: advisor.id,
          status: { in: ["CLOSED_WON", "CLOSED_LOST"] },
        },
      });
      const conversionRate = totalClosed > 0 ? closedWon / totalClosed : 0.5; // default 50%
      const conversionBonus = conversionRate * weights.conversionRateMultiplier;
      score += conversionBonus;
      reasons.push(`+${conversionBonus.toFixed(1)} tasa conversión ${(conversionRate * 100).toFixed(0)}%`);

      // 5. Response time penalty
      const recentLeads = await db.lead.findMany({
        where: {
          advisorId: advisor.id,
          firstResponseAt: { not: null },
          assignedAt: { not: null },
        },
        select: { assignedAt: true, firstResponseAt: true },
        take: 10,
        orderBy: { createdAt: "desc" },
      });

      if (recentLeads.length > 0) {
        const avgResponseHours =
          recentLeads.reduce((sum, l) => {
            const diff = l.firstResponseAt!.getTime() - l.assignedAt!.getTime();
            return sum + diff / (1000 * 60 * 60);
          }, 0) / recentLeads.length;

        const responsepenalty = avgResponseHours * weights.responseTimePenaltyPerHour;
        score -= responsepenalty;
        reasons.push(`-${responsepenalty.toFixed(1)} tiempo respuesta promedio ${avgResponseHours.toFixed(1)}h`);
      }

      return { advisorId: advisor.id, score, reasons };
    })
  );

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) return null;

  // Round-robin among tied top scorers (within 1 point)
  const topScore = scores[0].score;
  const topScorers = scores.filter((s) => Math.abs(s.score - topScore) < 1);

  // Pick the one with fewest active leads for round-robin tiebreak
  const winner = topScorers.reduce((best, current) => {
    const bestAdvisor = advisors.find((a) => a.id === best.advisorId);
    const currentAdvisor = advisors.find((a) => a.id === current.advisorId);
    if (!bestAdvisor || !currentAdvisor) return best;
    return currentAdvisor.leads.length < bestAdvisor.leads.length ? current : best;
  }, topScorers[0]);

  // Update lead assignment if leadId provided
  if (opts.leadId) {
    await db.lead.update({
      where: { id: opts.leadId },
      data: { advisorId: winner.advisorId, assignedAt: new Date(), status: "CONTACTED" },
    });
  }

  // Update session if sessionId provided
  if (opts.sessionId) {
    await db.botSession.update({
      where: { id: opts.sessionId },
      data: { advisorId: winner.advisorId },
    });
  }

  console.log(`[Assignment] Assigned to advisor ${winner.advisorId} (score: ${winner.score.toFixed(2)})`);

  return {
    advisorId: winner.advisorId,
    score: winner.score,
    reasons: winner.reasons,
  };
}
