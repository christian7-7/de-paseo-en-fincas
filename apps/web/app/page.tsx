import { Suspense } from "react";
import Link from "next/link";
import { Search, MapPin, Calendar, Users, Star, TreePine, Shield, Headphones } from "lucide-react";
import { FincaCard, Skeleton, Button } from "@repo/ui";
import { db } from "@repo/db";

export const dynamic = "force-dynamic";

async function getFeaturedFincas() {
  return db.finca.findMany({
    where: { status: "ACTIVE", featured: true },
    include: {
      images: { where: { isPrimary: true }, take: 1 },
      reviews: { select: { rating: true } },
    },
    take: 6,
  });
}

async function getPopularMunicipalities() {
  return db.municipality.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

const STATS = [
  { value: "500+", label: "Fincas disponibles", icon: TreePine },
  { value: "32", label: "Departamentos", icon: MapPin },
  { value: "4.8★", label: "Calificación promedio", icon: Star },
  { value: "10K+", label: "Familias felices", icon: Users },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Busca tu finca ideal",
    description: "Filtra por municipio, fechas, capacidad y amenidades. Tenemos fincas para todos los gustos y presupuestos.",
    icon: Search,
  },
  {
    step: "2",
    title: "Reserva en minutos",
    description: "Selecciona las fechas, confirma los detalles y paga de forma segura con PSE, tarjeta o Nequi.",
    icon: Calendar,
  },
  {
    step: "3",
    title: "Disfruta el paseo",
    description: "Recibe el código de acceso, llega y disfruta. Nuestro equipo está disponible 24/7 si necesitas ayuda.",
    icon: Shield,
  },
];

const TESTIMONIALS = [
  {
    name: "Claudia Vargas",
    municipality: "Bogotá",
    text: "Increíble experiencia. Encontramos la finca perfecta para el cumpleaños de mi mamá en Guatapé. El proceso de reserva fue súper fácil.",
    rating: 5,
    avatar: "CV",
  },
  {
    name: "Julián Mora",
    municipality: "Medellín",
    text: "Ya vamos por nuestra tercera reserva. La finca en Salento superó todas nuestras expectativas. Los propietarios son muy amables.",
    rating: 5,
    avatar: "JM",
  },
  {
    name: "Paola Ríos",
    municipality: "Cali",
    text: "El asistente virtual nos ayudó a encontrar la finca perfecta para nuestro grupo de 15 personas. Muy recomendado.",
    rating: 5,
    avatar: "PR",
  },
];

export default async function HomePage() {
  let featuredFincas: Awaited<ReturnType<typeof getFeaturedFincas>> = [];
  let municipalities: Awaited<ReturnType<typeof getPopularMunicipalities>> = [];
  let dbError: string | null = null;

  try {
    [featuredFincas, municipalities] = await Promise.all([
      getFeaturedFincas(),
      getPopularMunicipalities(),
    ]);
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="min-h-screen">
      {/* Temporary debug error banner */}
      {dbError && (
        <div style={{ background: "red", color: "white", padding: "1rem", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          DB ERROR: {dbError}
        </div>
      )}
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-border shadow-sm">
        <Link href="/" className="flex items-center gap-2">
          <TreePine className="h-6 w-6 text-[#E8832A]" />
          <span className="font-bold text-[#1A1D2E] text-lg">De Paseo en Fincas</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/fincas" className="text-muted-foreground hover:text-foreground transition-colors">Fincas</Link>
          <Link href="/destinos" className="text-muted-foreground hover:text-foreground transition-colors">Destinos</Link>
          <Link href="/chat" className="text-muted-foreground hover:text-foreground transition-colors">Chat</Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Iniciar sesión</Button>
          </Link>
          <Link href="/registro">
            <Button size="sm">Registrarse</Button>
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1920&q=85"
            alt="Finca colombiana en la naturaleza"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1A1D2E]/60 via-[#1A1D2E]/40 to-[#1A1D2E]/70" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center text-white">
          <p className="mb-3 text-sm font-semibold tracking-widest uppercase text-[#E8832A]">
            Turismo Rural Colombiano
          </p>
          <h1 className="mb-4 text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl">
            Tu próximo paseo en
            <span className="text-[#E8832A]"> finca</span> te espera
          </h1>
          <p className="mb-8 text-lg text-white/80 max-w-2xl mx-auto">
            Más de 500 fincas en 32 departamentos. Reserva fácil, pago seguro, y asistencia 24/7 por WhatsApp.
          </p>

          {/* Search bar */}
          <div className="bg-white rounded-2xl p-4 shadow-2xl flex flex-col md:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1 border border-border rounded-xl px-3 py-2">
              <MapPin className="h-4 w-4 text-[#E8832A] shrink-0" />
              <input
                type="text"
                placeholder="¿A dónde quieres ir? (Guatapé, Salento...)"
                className="flex-1 text-sm text-foreground placeholder:text-muted-foreground bg-transparent outline-none"
              />
            </div>
            <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2 min-w-[200px]">
              <Calendar className="h-4 w-4 text-[#E8832A] shrink-0" />
              <input
                type="text"
                placeholder="Fechas de entrada y salida"
                className="flex-1 text-sm text-foreground placeholder:text-muted-foreground bg-transparent outline-none"
              />
            </div>
            <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2 min-w-[140px]">
              <Users className="h-4 w-4 text-[#E8832A] shrink-0" />
              <input
                type="number"
                placeholder="Personas"
                min="1"
                className="flex-1 text-sm text-foreground placeholder:text-muted-foreground bg-transparent outline-none w-16"
              />
            </div>
            <Link href="/fincas" className="w-full md:w-auto">
              <Button size="lg" className="w-full md:w-auto gap-2">
                <Search className="h-4 w-4" />
                Buscar fincas
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="bg-[#1A1D2E] py-12">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center">
                <Icon className="h-6 w-6 text-[#E8832A] mx-auto mb-2" />
                <div className="text-2xl font-extrabold text-white">{value}</div>
                <div className="text-sm text-white/60">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Destinos populares ── */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold mb-2">Destinos populares</h2>
          <p className="text-muted-foreground mb-8">Los municipios que más eligen nuestros clientes</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {municipalities.slice(0, 8).map((m) => (
              <Link
                key={m.slug}
                href={`/fincas?municipality=${encodeURIComponent(m.name)}`}
                className="group relative overflow-hidden rounded-xl bg-muted h-24 flex items-end p-3 hover:shadow-md transition-shadow"
              >
                {m.heroImage && (
                  <img
                    src={m.heroImage}
                    alt={m.name}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="relative z-10">
                  <div className="font-semibold text-white text-sm">{m.name}</div>
                  <div className="text-white/70 text-xs">{m.department}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fincas destacadas ── */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">Fincas destacadas</h2>
              <p className="text-muted-foreground mt-1">Seleccionadas por nuestro equipo</p>
            </div>
            <Link href="/fincas">
              <Button variant="outline">Ver todas</Button>
            </Link>
          </div>

          <Suspense
            fallback={
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-80 rounded-2xl" />
                ))}
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredFincas.map((finca) => {
                const avgRating =
                  finca.reviews.length > 0
                    ? finca.reviews.reduce((s, r) => s + r.rating, 0) / finca.reviews.length
                    : null;
                return (
                  <FincaCard
                    key={finca.id}
                    id={finca.id}
                    slug={finca.slug}
                    name={finca.name}
                    municipality={finca.municipality}
                    department={finca.department}
                    capacity={finca.capacity}
                    bedrooms={finca.bedrooms}
                    pricePerNight={Number(finca.pricePerNight)}
                    weekendPrice={finca.weekendPrice ? Number(finca.weekendPrice) : null}
                    amenities={finca.amenities}
                    imageUrl={finca.images[0]?.url}
                    avgRating={avgRating}
                    reviewCount={finca.reviews.length}
                    featured={finca.featured}
                  />
                );
              })}
            </div>
          </Suspense>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-2">¿Cómo funciona?</h2>
            <p className="text-muted-foreground">Reserva tu finca en 3 simples pasos</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map(({ step, title, description, icon: Icon }) => (
              <div key={step} className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8832A]/10">
                  <Icon className="h-7 w-7 text-[#E8832A]" />
                </div>
                <div className="text-xs font-bold text-[#E8832A] uppercase tracking-widest mb-2">Paso {step}</div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonios ── */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Lo que dicen nuestros clientes</h2>
            <div className="flex justify-center gap-1 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-[#E8832A] text-[#E8832A]" />
              ))}
            </div>
            <p className="text-muted-foreground">4.8 de 5 en más de 2.000 reseñas verificadas</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-[#E8832A] text-[#E8832A]" />
                  ))}
                </div>
                <p className="text-sm text-foreground mb-4 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#E8832A]/20 flex items-center justify-center text-sm font-bold text-[#E8832A]">
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.municipality}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA whatsapp ── */}
      <section className="py-16 px-4 bg-[#E8832A]">
        <div className="mx-auto max-w-3xl text-center text-white">
          <Headphones className="h-10 w-10 mx-auto mb-4 opacity-90" />
          <h2 className="text-2xl font-bold mb-2">¿Necesitas ayuda para elegir?</h2>
          <p className="text-white/80 mb-6">
            Nuestro asistente Paseo está disponible 24/7 por WhatsApp para ayudarte a encontrar la finca perfecta.
          </p>
          <Link
            href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573001234567"}?text=Hola%20Paseo!%20Quiero%20buscar%20una%20finca`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="lg"
              className="bg-white text-[#E8832A] border-white hover:bg-white/90 hover:text-[#d4751f]"
            >
              Chatear por WhatsApp
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#1A1D2E] text-white/70 py-10 px-4">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TreePine className="h-5 w-5 text-[#E8832A]" />
              <span className="font-bold text-white">De Paseo en Fincas</span>
            </div>
            <p className="text-sm max-w-xs">Conectando familias colombianas con las mejores fincas del país.</p>
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <div className="font-semibold text-white mb-3">Plataforma</div>
              <div className="space-y-2">
                <Link href="/fincas" className="block hover:text-white transition-colors">Buscar fincas</Link>
                <Link href="/destinos" className="block hover:text-white transition-colors">Destinos</Link>
                <Link href="/propietarios" className="block hover:text-white transition-colors">Para propietarios</Link>
              </div>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">Legal</div>
              <div className="space-y-2">
                <Link href="/privacidad" className="block hover:text-white transition-colors">Privacidad</Link>
                <Link href="/terminos" className="block hover:text-white transition-colors">Términos</Link>
                <Link href="/cancelaciones" className="block hover:text-white transition-colors">Cancelaciones</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl mt-8 pt-8 border-t border-white/10 text-xs text-center text-white/40">
          © {new Date().getFullYear()} De Paseo en Fincas SAS. Bogotá, Colombia.
        </div>
      </footer>
    </main>
  );
}
