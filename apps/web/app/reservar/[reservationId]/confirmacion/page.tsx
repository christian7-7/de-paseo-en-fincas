export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "../../../../lib/auth";
import { db } from "@repo/db";
import {
  CheckCircle2,
  Calendar,
  Users,
  Key,
  Clock,
  Phone,
  TreePine,
  Download,
} from "lucide-react";
import { Button, Badge, Card, CardContent } from "@repo/ui";

interface Props {
  params: { reservationId: string };
}

export default async function ConfirmacionPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/reservar/${params.reservationId}/confirmacion`);

  const reservation = await db.reservation.findUnique({
    where: { id: params.reservationId, clientId: session.user.id },
    include: {
      finca: {
        include: { images: { where: { isPrimary: true }, take: 1 } },
      },
      payments: { where: { status: "APPROVED" }, take: 1 },
    },
  });

  if (!reservation) notFound();

  if (reservation.status === "PENDING_PAYMENT") {
    redirect(`/reservar/${params.reservationId}`);
  }

  const formatCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);

  const isConfirmed = reservation.status === "CONFIRMED";

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Success header */}
        <div className="text-center mb-8">
          <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isConfirmed ? "bg-green-100" : "bg-yellow-100"
          }`}>
            <CheckCircle2 className={`h-12 w-12 ${isConfirmed ? "text-green-500" : "text-yellow-500"}`} />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1D2E]">
            {isConfirmed ? "¡Reserva confirmada!" : "Reserva en revisión"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isConfirmed
              ? "Tu pago fue procesado exitosamente."
              : "Tu pago está siendo procesado. Te notificaremos pronto."}
          </p>
        </div>

        <Card className="shadow-lg mb-4">
          <CardContent className="pt-6 space-y-5">
            {/* Finca */}
            <div className="flex gap-4">
              <div className="h-20 w-28 rounded-xl bg-muted overflow-hidden shrink-0">
                {reservation.finca.images[0]?.url ? (
                  <img
                    src={reservation.finca.images[0].url}
                    alt={reservation.finca.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <TreePine className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={isConfirmed ? "default" : "secondary"}>
                    {isConfirmed ? "✅ Confirmada" : "⏳ Pendiente"}
                  </Badge>
                </div>
                <h2 className="font-bold text-lg">{reservation.finca.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {reservation.finca.municipality}, {reservation.finca.department}
                </p>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-xl">
                <Calendar className="h-4 w-4 text-[#E8832A] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground font-medium mb-0.5">Check-in</div>
                  <div className="font-semibold">
                    {new Date(reservation.checkIn).toLocaleDateString("es-CO", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-xl">
                <Calendar className="h-4 w-4 text-[#E8832A] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground font-medium mb-0.5">Check-out</div>
                  <div className="font-semibold">
                    {new Date(reservation.checkOut).toLocaleDateString("es-CO", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-xl">
                <Users className="h-4 w-4 text-[#E8832A] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground font-medium mb-0.5">Personas</div>
                  <div className="font-semibold">
                    {reservation.adults} adulto{reservation.adults !== 1 ? "s" : ""}
                    {reservation.children > 0 && ` · ${reservation.children} niño${reservation.children !== 1 ? "s" : ""}`}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-xl">
                <Clock className="h-4 w-4 text-[#E8832A] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground font-medium mb-0.5">Noches</div>
                  <div className="font-semibold">{reservation.nights}</div>
                </div>
              </div>
            </div>

            {/* Check-in code */}
            {isConfirmed && reservation.checkInCode && (
              <div className="bg-[#E8832A]/10 border border-[#E8832A]/30 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-[#E8832A]" />
                  <span className="text-sm font-semibold text-[#E8832A]">Código de acceso</span>
                </div>
                <div className="text-3xl font-bold tracking-[0.3em] text-[#1A1D2E]">
                  {reservation.checkInCode}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Presenta este código al llegar a la finca
                </p>
              </div>
            )}

            {/* Payment summary */}
            <div className="border-t pt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal ({reservation.nights} noches)</span>
                <span>{formatCOP(reservation.basePrice)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cargo de servicio</span>
                <span>{formatCOP(reservation.platformFee)}</span>
              </div>
              {reservation.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span>
                  <span>−{formatCOP(reservation.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t mt-1">
                <span>Total pagado</span>
                <span className="text-[#E8832A]">{formatCOP(reservation.totalPrice)}</span>
              </div>
            </div>

            {/* WhatsApp CTA */}
            <a
              href={`https://wa.me/573001234567?text=${encodeURIComponent(
                `Hola! Tengo una reserva confirmada en ${reservation.finca.name} del ${new Date(reservation.checkIn).toLocaleDateString("es-CO")} al ${new Date(reservation.checkOut).toLocaleDateString("es-CO")}. Código: ${reservation.checkInCode || "pendiente"}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full gap-2">
                <Phone className="h-4 w-4" />
                Contactar soporte por WhatsApp
              </Button>
            </a>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Link href="/cuenta" className="flex-1">
            <Button variant="outline" className="w-full">Mis reservas</Button>
          </Link>
          <Link href="/fincas" className="flex-1">
            <Button className="w-full bg-[#E8832A] hover:bg-[#d4721f] text-white">
              Explorar más fincas
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
