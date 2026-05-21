import { redirect } from "next/navigation";
import { auth } from "../lib/auth";
import { db } from "@repo/db";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@repo/ui";
import {
  TreePine, Calendar, DollarSign, Star, TrendingUp,
  Upload, Settings, Eye, ImageIcon,
} from "lucide-react";
import Link from "next/link";

async function getOwnerData(ownerId: string) {
  const fincas = await db.finca.findMany({
    where: { ownerId },
    include: {
      images: { orderBy: { order: "asc" } },
      reservations: {
        where: {
          status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
          checkIn: { gte: new Date() },
        },
        orderBy: { checkIn: "asc" },
        take: 5,
      },
      reviews: {
        where: { publishedAt: { not: null } },
        select: { rating: true },
      },
    },
  });

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const monthlyRevenue = await db.reservation.aggregate({
    where: {
      finca: { ownerId },
      status: { in: ["CONFIRMED", "COMPLETED"] },
      createdAt: { gte: thisMonth },
    },
    _sum: { ownerPayout: true },
  });

  return { fincas, monthlyRevenue: monthlyRevenue._sum.ownerPayout || 0 };
}

export default async function OwnerPortalPage() {
  const session = await auth();

  if (!session?.user) redirect("/login");
  if (!["PROPIETARIO", "ADMIN"].includes((session.user as { role: string }).role)) {
    redirect("/");
  }

  const { fincas, monthlyRevenue } = await getOwnerData(session.user.id);

  const totalUpcomingReservations = fincas.reduce((s, f) => s + f.reservations.length, 0);
  const avgRating =
    fincas.flatMap((f) => f.reviews).reduce((s, r, _, arr) => s + r.rating / arr.length, 0) || 0;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-[#E8832A]" />
          <span className="font-bold text-sm">Portal Propietarios</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {session.user.name}
        </div>
      </nav>

      <div className="mx-auto max-w-5xl p-6 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">Hola, {session.user.name?.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground">Aquí está el resumen de tus fincas</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Mis fincas", value: fincas.length, icon: TreePine },
            { label: "Reservas próximas", value: totalUpcomingReservations, icon: Calendar },
            { label: "Ingresos este mes", value: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(monthlyRevenue), icon: DollarSign },
            { label: "Calificación", value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : "—", icon: Star },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <Icon className="h-4 w-4 text-[#E8832A] mb-2" />
                <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString("es-CO") : value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Fincas management */}
        {fincas.map((finca) => {
          const fincaAvgRating =
            finca.reviews.length > 0
              ? finca.reviews.reduce((s, r) => s + r.rating, 0) / finca.reviews.length
              : null;

          return (
            <Card key={finca.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{finca.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {finca.municipality}, {finca.department}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge
                      variant={finca.status === "ACTIVE" ? "default" : "secondary"}
                    >
                      {finca.status === "ACTIVE" ? "Activa" : finca.status}
                    </Badge>
                    {fincaAvgRating && (
                      <Badge variant="outline">★ {fincaAvgRating.toFixed(1)}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick actions */}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/finca/${finca.slug}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Eye className="h-3.5 w-3.5" />
                      Ver en web
                    </Button>
                  </Link>
                  <Link href={`/portal/finca/${finca.id}/disponibilidad`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      Disponibilidad
                    </Button>
                  </Link>
                  <Link href={`/portal/finca/${finca.id}/fotos`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Fotos ({finca.images.length})
                    </Button>
                  </Link>
                  <Link href={`/portal/finca/${finca.id}/precios`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <DollarSign className="h-3.5 w-3.5" />
                      Precios
                    </Button>
                  </Link>
                </div>

                {/* Upcoming reservations */}
                {finca.reservations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Próximas reservas</h4>
                    <div className="space-y-2">
                      {finca.reservations.map((res) => (
                        <div
                          key={res.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg text-sm"
                        >
                          <div>
                            <div className="font-medium">
                              {new Date(res.checkIn).toLocaleDateString("es-CO")} →{" "}
                              {new Date(res.checkOut).toLocaleDateString("es-CO")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {res.adults} adultos{res.children > 0 ? ` + ${res.children} niños` : ""} · {res.nights} noches
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-[#E8832A]">
                              {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(res.ownerPayout)}
                            </div>
                            <Badge variant={res.status === "CONFIRMED" ? "default" : "secondary"} className="text-xs">
                              {res.status === "CONFIRMED" ? "Confirmada" : "Pago pendiente"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Photo upload area */}
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-[#E8832A] transition-colors cursor-pointer">
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Arrastra fotos aquí o{" "}
                    <span className="text-[#E8832A] font-medium">selecciona archivos</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG hasta 10MB</p>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {fincas.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <TreePine className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Aún no tienes fincas registradas</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Contacta al equipo de De Paseo en Fincas para agregar tu propiedad.
              </p>
              <a
                href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573001234567"}?text=Hola! Quiero registrar mi finca`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button>Contactar al equipo</Button>
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
