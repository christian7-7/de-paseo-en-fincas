import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
import Link from "next/link";
import { auth } from "../../lib/auth";
import { db } from "@repo/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@repo/ui";
import { Calendar, Heart, Settings, LogOut, TreePine, Star } from "lucide-react";
import { AddToCalendarButton, ConnectCalendarButton } from "./CalendarButton";

async function getUserData(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      reservations: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          finca: {
            include: { images: { where: { isPrimary: true }, take: 1 } },
          },
        },
        where: { clientId: userId },
      },
    },
  });
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING_PAYMENT: { label: "Pago pendiente", variant: "secondary" },
  CONFIRMED: { label: "Confirmada", variant: "default" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
  COMPLETED: { label: "Completada", variant: "outline" },
  NO_SHOW: { label: "No show", variant: "destructive" },
};

export default async function CuentaPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await getUserData(session.user.id);

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Nav */}
      <nav className="bg-white border-b border-border px-4 py-3">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-[#E8832A]" />
            <span className="font-bold hidden sm:inline">De Paseo en Fincas</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#E8832A]/20 flex items-center justify-center text-sm font-bold text-[#E8832A]">
              {user.name?.slice(0, 2).toUpperCase() || "?"}
            </div>
            <span className="text-sm font-medium hidden sm:inline">{user.name}</span>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">¡Hola, {user.name?.split(" ")[0]}! 👋</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Calendar, label: "Mis reservas", href: "#reservas" },
            { icon: Heart, label: "Favoritas", href: "#favoritas" },
            { icon: Star, label: "Mis reseñas", href: "#resenas" },
            { icon: Settings, label: "Configuración", href: "#config" },
          ].map(({ icon: Icon, label, href }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-col items-center gap-2 p-4 bg-card border border-border rounded-xl hover:border-[#E8832A] hover:shadow-sm transition-all"
            >
              <Icon className="h-5 w-5 text-[#E8832A]" />
              <span className="text-xs font-medium text-center">{label}</span>
            </Link>
          ))}
        </div>

        {/* Reservations */}
        <div id="reservas">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Mis reservas</h2>
            <Link href="/fincas">
              <Button variant="outline" size="sm">Nueva reserva</Button>
            </Link>
          </div>

          {user.reservations.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <TreePine className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aún no tienes reservas</p>
                <Link href="/fincas" className="mt-4 inline-block">
                  <Button>Buscar fincas</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {user.reservations.map((reservation) => {
                const statusInfo = STATUS_LABELS[reservation.status] || { label: reservation.status, variant: "outline" as const };
                return (
                  <Card key={reservation.id}>
                    <CardContent className="py-4">
                      <div className="flex gap-3 items-start">
                        <div className="h-14 w-20 rounded-lg bg-muted overflow-hidden shrink-0">
                          {reservation.finca.images[0]?.url && (
                            <img
                              src={reservation.finca.images[0].url}
                              alt={reservation.finca.name}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-sm truncate">{reservation.finca.name}</h3>
                            <Badge variant={statusInfo.variant} className="shrink-0 text-xs">
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {reservation.finca.municipality}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(reservation.checkIn).toLocaleDateString("es-CO")} →{" "}
                            {new Date(reservation.checkOut).toLocaleDateString("es-CO")} · {reservation.nights} noches
                          </p>
                          <p className="text-sm font-semibold text-[#E8832A] mt-1">
                            {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(reservation.totalPrice)}
                          </p>
                        </div>
                      </div>
                      {reservation.status === "PENDING_PAYMENT" && (
                        <div className="mt-3 pt-3 border-t">
                          <Link href={`/reservar/${reservation.id}?step=payment`}>
                            <Button size="sm" className="w-full sm:w-auto">Completar pago</Button>
                          </Link>
                        </div>
                      )}
                      {reservation.status === "CONFIRMED" && (
                        <div className="mt-3 pt-3 border-t flex gap-2">
                          <AddToCalendarButton reservationId={reservation.id} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Google Calendar */}
        <Card id="config">
          <CardHeader>
            <CardTitle className="text-base">Conectar Google Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectCalendarButton connected={!!user.googleCalendarToken} />
          </CardContent>
        </Card>

        {/* Sign out */}
        <div className="text-center pb-8">
          <form action="/api/auth/signout" method="POST">
            <Button type="submit" variant="ghost" className="gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
