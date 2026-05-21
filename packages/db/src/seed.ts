import { PrismaClient, UserRole, Channel, FincaStatus, CancellationPolicy, LeadStatus, LeadSource, DiscountType, KnowledgeChunkType } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Users ────────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Paseo2025!", 10);

  const admin = await db.user.upsert({
    where: { email: "admin@depaseoenfincas.co" },
    update: {},
    create: {
      email: "admin@depaseoenfincas.co",
      name: "Admin De Paseo",
      role: UserRole.ADMIN,
      passwordHash,
      preferredChannel: Channel.EMAIL,
      profile: { create: {} },
    },
  });

  const asesores = await Promise.all([
    db.user.upsert({
      where: { email: "carlos.asesor@depaseoenfincas.co" },
      update: {},
      create: {
        email: "carlos.asesor@depaseoenfincas.co",
        name: "Carlos Ramírez",
        phone: "+573001234567",
        role: UserRole.ASESOR,
        passwordHash,
        isOnline: true,
        profile: { create: { municipalityPreferences: ["Guatapé", "Salento", "Barichara"] } },
      },
    }),
    db.user.upsert({
      where: { email: "maria.asesora@depaseoenfincas.co" },
      update: {},
      create: {
        email: "maria.asesora@depaseoenfincas.co",
        name: "María González",
        phone: "+573009876543",
        role: UserRole.ASESOR,
        passwordHash,
        isOnline: false,
        profile: { create: { municipalityPreferences: ["Anapoima", "La Mesa", "Villeta"] } },
      },
    }),
    db.user.upsert({
      where: { email: "juan.asesor@depaseoenfincas.co" },
      update: {},
      create: {
        email: "juan.asesor@depaseoenfincas.co",
        name: "Juan Ospina",
        phone: "+573005555555",
        role: UserRole.ASESOR,
        passwordHash,
        isOnline: true,
        profile: { create: { municipalityPreferences: ["San Gil", "Girardot", "Melgar"] } },
      },
    }),
  ]);

  const propietarios = await Promise.all([
    db.user.upsert({
      where: { email: "propietario1@finca.co" },
      update: {},
      create: {
        email: "propietario1@finca.co",
        name: "Roberto Londoño",
        phone: "+573002222222",
        role: UserRole.PROPIETARIO,
        passwordHash,
        profile: { create: {} },
      },
    }),
    db.user.upsert({
      where: { email: "propietario2@finca.co" },
      update: {},
      create: {
        email: "propietario2@finca.co",
        name: "Ana Herrera",
        phone: "+573003333333",
        role: UserRole.PROPIETARIO,
        passwordHash,
        profile: { create: {} },
      },
    }),
  ]);

  const clientes = await Promise.all([
    db.user.upsert({
      where: { email: "cliente1@gmail.com" },
      update: {},
      create: {
        email: "cliente1@gmail.com",
        name: "Sofía Martínez",
        phone: "+573104444444",
        role: UserRole.CLIENTE,
        passwordHash,
        profile: { create: { budgetMin: 200000, budgetMax: 600000, typicalGroupSize: 6 } },
      },
    }),
    db.user.upsert({
      where: { email: "cliente2@gmail.com" },
      update: {},
      create: {
        email: "cliente2@gmail.com",
        name: "Andrés Castro",
        phone: "+573115555555",
        role: UserRole.CLIENTE,
        passwordHash,
        profile: { create: { budgetMin: 400000, budgetMax: 1200000, typicalGroupSize: 10 } },
      },
    }),
    db.user.upsert({
      where: { email: "cliente3@gmail.com" },
      update: {},
      create: {
        email: "cliente3@gmail.com",
        name: "Valentina Ruiz",
        phone: "+573126666666",
        role: UserRole.CLIENTE,
        passwordHash,
        profile: { create: {} },
      },
    }),
    db.user.upsert({
      where: { email: "cliente4@gmail.com" },
      update: {},
      create: {
        email: "cliente4@gmail.com",
        name: "Felipe Moreno",
        phone: "+573137777777",
        role: UserRole.CLIENTE,
        passwordHash,
        profile: { create: {} },
      },
    }),
    db.user.upsert({
      where: { email: "cliente5@gmail.com" },
      update: {},
      create: {
        email: "cliente5@gmail.com",
        name: "Camila Torres",
        phone: "+573148888888",
        role: UserRole.CLIENTE,
        passwordHash,
        profile: { create: {} },
      },
    }),
  ]);

  console.log(`✅ Users: ${1 + asesores.length + propietarios.length + clientes.length} creados`);

  // ─── Municipalities ────────────────────────────────────────────────────────────
  const municipalities = [
    { slug: "guatape", name: "Guatapé", department: "Antioquia", lat: 6.2333, lng: -75.1572, avgTempCelsius: 20, distanceKmBogota: 442, distanceKmMedellin: 79, description: "La Piedra del Peñol y el embalse más hermoso de Colombia.", heroImage: "https://images.unsplash.com/photo-1612201142855-7873bc1661b4?w=1200" },
    { slug: "anapoima", name: "Anapoima", department: "Cundinamarca", lat: 4.5508, lng: -74.5365, avgTempCelsius: 28, distanceKmBogota: 83, distanceKmMedellin: 380, description: "El jardín de Cundinamarca, perfecto para el descanso." },
    { slug: "la-mesa", name: "La Mesa", department: "Cundinamarca", lat: 4.6333, lng: -74.4667, avgTempCelsius: 24, distanceKmBogota: 62, distanceKmMedellin: 395 },
    { slug: "villeta", name: "Villeta", department: "Cundinamarca", lat: 5.0144, lng: -74.4731, avgTempCelsius: 29, distanceKmBogota: 92, distanceKmMedellin: 360 },
    { slug: "pacho", name: "Pacho", department: "Cundinamarca", lat: 5.1333, lng: -74.15, avgTempCelsius: 18, distanceKmBogota: 82, distanceKmMedellin: 380 },
    { slug: "carmen-de-apicala", name: "Carmen de Apicalá", department: "Tolima", lat: 4.1508, lng: -74.7189, avgTempCelsius: 30, distanceKmBogota: 128, distanceKmMedellin: 400 },
    { slug: "san-gil", name: "San Gil", department: "Santander", lat: 6.5544, lng: -73.1339, avgTempCelsius: 23, distanceKmBogota: 330, distanceKmMedellin: 480, description: "Capital de aventura de Colombia. Rafting, parapente y naturaleza." },
    { slug: "barichara", name: "Barichara", department: "Santander", lat: 6.6333, lng: -73.2333, avgTempCelsius: 22, distanceKmBogota: 350, distanceKmMedellin: 500, description: "El pueblo más lindo de Colombia. Patrimonio histórico." },
    { slug: "salento", name: "Salento", department: "Quindío", lat: 4.6369, lng: -75.5716, avgTempCelsius: 18, distanceKmBogota: 290, distanceKmMedellin: 185, description: "Corazón del Eje Cafetero. Valle del Cocora y palmas de cera." },
    { slug: "armenia", name: "Armenia", department: "Quindío", lat: 4.5339, lng: -75.6811, avgTempCelsius: 23, distanceKmBogota: 288, distanceKmMedellin: 183 },
    { slug: "montenegro", name: "Montenegro", department: "Quindío", lat: 4.5681, lng: -75.7519, avgTempCelsius: 24, distanceKmBogota: 290, distanceKmMedellin: 188 },
    { slug: "girardot", name: "Girardot", department: "Cundinamarca", lat: 4.3036, lng: -74.8022, avgTempCelsius: 35, distanceKmBogota: 132, distanceKmMedellin: 360 },
    { slug: "melgar", name: "Melgar", department: "Tolima", lat: 4.2014, lng: -74.6436, avgTempCelsius: 33, distanceKmBogota: 115, distanceKmMedellin: 370 },
    { slug: "ibague", name: "Ibagué", department: "Tolima", lat: 4.4389, lng: -75.2322, avgTempCelsius: 25, distanceKmBogota: 199, distanceKmMedellin: 296 },
    { slug: "honda", name: "Honda", department: "Tolima", lat: 5.2022, lng: -74.7392, avgTempCelsius: 32, distanceKmBogota: 140, distanceKmMedellin: 310 },
    { slug: "manizales", name: "Manizales", department: "Caldas", lat: 5.0703, lng: -75.5138, avgTempCelsius: 17, distanceKmBogota: 310, distanceKmMedellin: 195 },
    { slug: "medellin", name: "Medellín", department: "Antioquia", lat: 6.2442, lng: -75.5812, avgTempCelsius: 22, distanceKmBogota: 415, distanceKmMedellin: 0 },
    { slug: "bogota", name: "Bogotá", department: "Cundinamarca", lat: 4.711, lng: -74.0721, avgTempCelsius: 14, distanceKmBogota: 0, distanceKmMedellin: 415 },
    { slug: "cali", name: "Cali", department: "Valle del Cauca", lat: 3.4516, lng: -76.532, avgTempCelsius: 25, distanceKmBogota: 461, distanceKmMedellin: 415 },
    { slug: "bucaramanga", name: "Bucaramanga", department: "Santander", lat: 7.1254, lng: -73.1198, avgTempCelsius: 27, distanceKmBogota: 395, distanceKmMedellin: 380 },
  ];

  for (const m of municipalities) {
    await db.municipality.upsert({
      where: { slug: m.slug },
      update: {},
      create: {
        slug: m.slug,
        name: m.name,
        department: m.department,
        lat: m.lat,
        lng: m.lng,
        avgTempCelsius: m.avgTempCelsius,
        distanceKmBogota: m.distanceKmBogota,
        distanceKmMedellin: m.distanceKmMedellin,
        description: m.description,
        heroImage: m.heroImage,
        active: true,
        seoTitle: `Fincas en ${m.name}, ${m.department} | De Paseo en Fincas`,
        seoDescription: `Arrienda fincas en ${m.name}. Las mejores opciones para tu descanso con toda la familia.`,
      },
    });
  }

  console.log(`✅ Municipalities: ${municipalities.length} creados`);

  // ─── Fincas ───────────────────────────────────────────────────────────────────
  const fincasData = [
    {
      slug: "finca-el-paraiso-guatape",
      name: "Finca El Paraíso",
      municipality: "Guatapé",
      department: "Antioquia",
      lat: 6.2400, lng: -75.1600,
      description: "Hermosa finca con vista panorámica al embalse de Guatapé. Cuenta con piscina privada, zona de BBQ, hamacas y todos los servicios para un descanso perfecto. A solo 10 minutos de La Piedra del Peñol.",
      shortDescription: "Vista al embalse, piscina privada y zona BBQ en Guatapé.",
      capacity: 12, bedrooms: 5, bathrooms: 4,
      pricePerNight: 450000, weekendPrice: 620000, holidayPrice: 750000,
      minNights: 2,
      amenities: ["piscina", "bbq", "wifi", "parqueadero", "aire_acondicionado", "jacuzzi", "hamacas", "cocina_equipada"],
      ownerId: propietarios[0].id,
      images: [
        { url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800", publicId: "finca-paraiso-1", width: 800, height: 600, isPrimary: true, order: 0 },
        { url: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800", publicId: "finca-paraiso-2", width: 800, height: 600, order: 1 },
        { url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800", publicId: "finca-paraiso-3", width: 800, height: 600, order: 2 },
      ],
    },
    {
      slug: "villa-del-cafe-salento",
      name: "Villa del Café",
      municipality: "Salento",
      department: "Quindío",
      lat: 4.6400, lng: -75.5750,
      description: "Auténtica finca cafetera en el corazón del Eje Cafetero. Rodeada de cultivos de café, bambú y palmas de cera. Desayuno incluido con productos de la finca. Guatequea y brindis de bienvenida.",
      shortDescription: "Finca cafetera auténtica en Salento con desayuno incluido.",
      capacity: 8, bedrooms: 4, bathrooms: 3,
      pricePerNight: 380000, weekendPrice: 520000,
      minNights: 2,
      amenities: ["desayuno_incluido", "wifi", "parqueadero", "tour_cafe", "hamacas", "fogon", "cocina_equipada"],
      ownerId: propietarios[1].id,
      images: [
        { url: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800", publicId: "villa-cafe-1", width: 800, height: 600, isPrimary: true, order: 0 },
        { url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800", publicId: "villa-cafe-2", width: 800, height: 600, order: 1 },
      ],
    },
    {
      slug: "hacienda-sol-anapoima",
      name: "Hacienda Sol",
      municipality: "Anapoima",
      department: "Cundinamarca",
      lat: 4.5550, lng: -74.5400,
      description: "Espaciosa hacienda colonial a orillas del río. Tres piscinas, zona de juegos infantiles, canchas deportivas y amplias zonas verdes. Perfecta para grupos grandes y eventos familiares.",
      shortDescription: "Hacienda con 3 piscinas y canchas deportivas en Anapoima.",
      capacity: 20, bedrooms: 8, bathrooms: 6,
      pricePerNight: 680000, weekendPrice: 950000, holidayPrice: 1200000,
      minNights: 2,
      amenities: ["piscina", "bbq", "wifi", "parqueadero", "cancha_futbol", "cancha_tejo", "zona_juegos", "cocina_equipada", "aire_acondicionado"],
      ownerId: propietarios[0].id,
      images: [
        { url: "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800", publicId: "hacienda-sol-1", width: 800, height: 600, isPrimary: true, order: 0 },
        { url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800", publicId: "hacienda-sol-2", width: 800, height: 600, order: 1 },
      ],
    },
    {
      slug: "retiro-del-rio-san-gil",
      name: "Retiro del Río",
      municipality: "San Gil",
      department: "Santander",
      lat: 6.5600, lng: -73.1400,
      description: "Finca aventurera a orillas del río Fonce. Incluye acceso directo al río, zona de camping, fogón de leña y conexión a operadores de rafting y parapente. La base perfecta para explorar San Gil.",
      shortDescription: "Aventura en San Gil: finca con acceso al río y zona camping.",
      capacity: 16, bedrooms: 6, bathrooms: 4,
      pricePerNight: 320000, weekendPrice: 460000,
      minNights: 2,
      amenities: ["rio", "camping", "fogon", "wifi", "parqueadero", "bbq", "hamacas"],
      ownerId: propietarios[1].id,
      images: [
        { url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800", publicId: "retiro-rio-1", width: 800, height: 600, isPrimary: true, order: 0 },
      ],
    },
    {
      slug: "casa-colonial-barichara",
      name: "Casa Colonial Barichara",
      municipality: "Barichara",
      department: "Santander",
      lat: 6.6380, lng: -73.2350,
      description: "Casa colonial restaurada en el pueblo más lindo de Colombia. Patios interiores, jardines de flores nativas, habitaciones con vista al cañón del Chicamocha. Arquitectura tradicional de piedra y bahareque.",
      shortDescription: "Casa colonial auténtica en el centro histórico de Barichara.",
      capacity: 6, bedrooms: 3, bathrooms: 2,
      pricePerNight: 290000, weekendPrice: 420000,
      minNights: 2,
      amenities: ["wifi", "parqueadero", "cocina_equipada", "terraza", "hamacas", "fogon"],
      ownerId: propietarios[0].id,
      images: [
        { url: "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=800", publicId: "casa-colonial-1", width: 800, height: 600, isPrimary: true, order: 0 },
      ],
    },
    {
      slug: "finca-la-esperanza-villeta",
      name: "Finca La Esperanza",
      municipality: "Villeta",
      department: "Cundinamarca",
      lat: 5.0200, lng: -74.4800,
      description: "Finca panelera tradicional con piscina temperada, zona húmeda completa (turco, sauna, jacuzzi). A 1.5 horas de Bogotá. Ideal para escapadas rápidas de fin de semana en familia.",
      shortDescription: "Zona húmeda completa y piscina temperada a 90 min de Bogotá.",
      capacity: 10, bedrooms: 4, bathrooms: 3,
      pricePerNight: 280000, weekendPrice: 400000,
      amenities: ["piscina", "jacuzzi", "sauna", "turco", "wifi", "parqueadero", "bbq", "cocina_equipada"],
      ownerId: propietarios[1].id,
      images: [
        { url: "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800", publicId: "esperanza-1", width: 800, height: 600, isPrimary: true, order: 0 },
      ],
    },
    {
      slug: "casa-campestre-melgar",
      name: "Casa Campestre El Oasis",
      municipality: "Melgar",
      department: "Tolima",
      lat: 4.2050, lng: -74.6470,
      description: "Casa campestre moderna en conjunto cerrado de Melgar. Piscina privada, zona de BBQ techada, cancha de tejo. Acceso a club house del conjunto con canchas deportivas. La temperatura perfecta.",
      shortDescription: "Casa moderna con piscina privada en conjunto de Melgar.",
      capacity: 8, bedrooms: 3, bathrooms: 3,
      pricePerNight: 350000, weekendPrice: 480000, holidayPrice: 600000,
      amenities: ["piscina", "bbq", "wifi", "parqueadero", "cancha_tejo", "aire_acondicionado"],
      ownerId: propietarios[0].id,
      images: [
        { url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800", publicId: "oasis-melgar-1", width: 800, height: 600, isPrimary: true, order: 0 },
      ],
    },
    {
      slug: "finca-entre-rios-honda",
      name: "Finca Entre Ríos",
      municipality: "Honda",
      department: "Tolima",
      lat: 5.2080, lng: -74.7440,
      description: "Histórica finca en la ciudad más caliente de Colombia. Ubicada entre el río Magdalena y el río Gualí. Piscina natural de río, pesca artesanal y cocina tradicional tolimense incluida en el paquete.",
      shortDescription: "Piscina natural de río y gastronomía tolimense en Honda.",
      capacity: 14, bedrooms: 6, bathrooms: 4,
      pricePerNight: 310000, weekendPrice: 440000,
      amenities: ["rio", "pesca", "wifi", "parqueadero", "bbq", "cocina_equipada", "hamacas", "aire_acondicionado"],
      ownerId: propietarios[1].id,
      images: [
        { url: "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=800", publicId: "entre-rios-1", width: 800, height: 600, isPrimary: true, order: 0 },
      ],
    },
    {
      slug: "chalet-andino-manizales",
      name: "Chalet Andino",
      municipality: "Manizales",
      department: "Caldas",
      lat: 5.0750, lng: -75.5180,
      description: "Moderno chalet de montaña con vista al volcán Nevado del Ruiz. Chimenea, jacuzzi exterior calefaccionado, jardines nativos. El refugio perfecto en los Andes colombianos para climaturas frescas.",
      shortDescription: "Chalet con vista al volcán, chimenea y jacuzzi exterior en Manizales.",
      capacity: 6, bedrooms: 3, bathrooms: 2,
      pricePerNight: 420000, weekendPrice: 580000,
      minNights: 2,
      amenities: ["jacuzzi", "chimenea", "wifi", "parqueadero", "terraza", "bbq", "cocina_equipada"],
      ownerId: propietarios[0].id,
      images: [
        { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800", publicId: "chalet-andino-1", width: 800, height: 600, isPrimary: true, order: 0 },
      ],
    },
    {
      slug: "villa-recanto-girardot",
      name: "Villa Recanto",
      municipality: "Girardot",
      department: "Cundinamarca",
      lat: 4.3080, lng: -74.8050,
      description: "Amplia villa de lujo en exclusivo sector de Girardot. Tres piscinas (adultos, niños y temperada), cancha de squash, sala de entretenimiento. Mayordomo y servicio de aseo incluidos.",
      shortDescription: "Villa de lujo con 3 piscinas y mayordomo en Girardot.",
      capacity: 18, bedrooms: 7, bathrooms: 6,
      pricePerNight: 780000, weekendPrice: 1100000, holidayPrice: 1400000,
      minNights: 2,
      amenities: ["piscina", "jacuzzi", "bbq", "wifi", "parqueadero", "cancha_tenis", "sala_entretenimiento", "mayordomo", "aire_acondicionado", "cocina_equipada"],
      ownerId: propietarios[1].id,
      featured: true,
      images: [
        { url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800", publicId: "villa-recanto-1", width: 800, height: 600, isPrimary: true, order: 0 },
        { url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800", publicId: "villa-recanto-2", width: 800, height: 600, order: 1 },
      ],
    },
  ];

  for (const f of fincasData) {
    const { images, ownerId, ...fincaData } = f;
    const finca = await db.finca.upsert({
      where: { slug: fincaData.slug },
      update: {},
      create: {
        ...fincaData,
        ownerId,
        status: FincaStatus.ACTIVE,
        cancellationPolicy: CancellationPolicy.MODERATE,
        minNights: fincaData.minNights || 1,
        featured: fincaData.featured || false,
        images: {
          create: images.map((img) => ({
            url: img.url,
            publicId: img.publicId,
            alt: fincaData.name,
            width: img.width,
            height: img.height,
            order: img.order,
            isPrimary: img.isPrimary || false,
          })),
        },
      },
    });

    // Seed availability for next 90 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const availabilityEntries = [];
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      availabilityEntries.push({
        fincaId: finca.id,
        date,
        status: "AVAILABLE" as const,
        source: "MANUAL" as const,
      });
    }

    await db.availability.createMany({
      data: availabilityEntries,
      skipDuplicates: true,
    });
  }

  console.log(`✅ Fincas: ${fincasData.length} creadas con disponibilidad 90 días`);

  // ─── KnowledgeChunks (FAQs + Políticas) ───────────────────────────────────────
  const faqs = [
    {
      type: KnowledgeChunkType.FAQ,
      content: "Q: ¿Cómo hago una reserva?\nA: Puedes reservar directamente en nuestra web eligiendo las fechas, la cantidad de personas y la finca. También puedes escribirnos por WhatsApp al +57 300 123 4567 y nuestro asistente Paseo te ayudará.",
    },
    {
      type: KnowledgeChunkType.FAQ,
      content: "Q: ¿Cuál es la política de cancelación?\nA: Depende de la finca elegida. Flexible: reembolso total hasta 24 horas antes. Moderada: reembolso total hasta 5 días antes, 50% entre 1-5 días. Estricta: reembolso total hasta 14 días antes, sin reembolso después.",
    },
    {
      type: KnowledgeChunkType.FAQ,
      content: "Q: ¿Cuáles son los métodos de pago?\nA: Aceptamos PSE, tarjetas débito/crédito, Nequi y cuotas con ADDI. Todo a través de la plataforma Wompi, 100% seguro.",
    },
    {
      type: KnowledgeChunkType.FAQ,
      content: "Q: ¿Puedo llevar mascotas?\nA: Cada finca tiene su propia política. En la ficha de cada finca encontrarás si se permiten mascotas. Si tienes dudas, escríbenos y te confirmamos.",
    },
    {
      type: KnowledgeChunkType.FAQ,
      content: "Q: ¿A qué hora es el check-in y check-out?\nA: El check-in es generalmente a las 3:00 PM y el check-out a las 12:00 PM. Algunas fincas ofrecen late check-out con costo adicional. Consúltanos con anticipación.",
    },
  ];

  const policies = [
    {
      type: KnowledgeChunkType.POLICY,
      content: "POLÍTICA DE PRIVACIDAD: De Paseo en Fincas respeta tu privacidad. Los datos personales recopilados (nombre, email, teléfono) se usan exclusivamente para procesar reservas y comunicarte información relevante. No compartimos datos con terceros sin tu consentimiento. Puedes solicitar la eliminación de tus datos en cualquier momento.",
    },
    {
      type: KnowledgeChunkType.POLICY,
      content: "TÉRMINOS Y CONDICIONES: Al realizar una reserva en De Paseo en Fincas aceptas: (1) Respetar las normas de la finca. (2) Responder por daños causados. (3) La cantidad de personas no puede exceder la capacidad indicada. (4) No se permiten eventos no autorizados. (5) Las mascotas solo si están explícitamente permitidas.",
    },
    {
      type: KnowledgeChunkType.POLICY,
      content: "POLÍTICA DE REEMBOLSOS: Los reembolsos se procesan en 5-10 días hábiles al mismo método de pago original. En casos de fuerza mayor (desastres naturales, pandemias), ofrecemos crédito para futuras reservas por el valor total.",
    },
  ];

  await db.knowledgeChunk.createMany({
    data: [...faqs, ...policies].map((k) => ({
      type: k.type,
      content: k.content,
      metadata: {},
    })),
    skipDuplicates: true,
  });

  console.log(`✅ KnowledgeChunks: ${faqs.length} FAQs + ${policies.length} políticas`);

  // ─── BotConfig ─────────────────────────────────────────────────────────────────
  const botConfigs = [
    {
      key: "system_prompt",
      category: "bot",
      description: "System prompt principal del bot Paseo",
      value: {
        text: `Eres Paseo, el asistente virtual amigable de De Paseo en Fincas 🌿

IDENTIDAD:
- Eres experto en turismo rural colombiano
- Tu tono es cálido, cercano y colombiano natural (no exageradamente informal)
- Usas emojis con moderación (máximo 2 por mensaje)
- Respondes en español colombiano

FLUJO CONVERSACIONAL:
1. Saluda con entusiasmo y pregunta por las necesidades
2. Extrae: municipio o región deseada, fechas, número de personas (adultos y niños), presupuesto aproximado
3. Busca fincas con search_fincas
4. Presenta máximo 3 opciones con sus características principales
5. Si el cliente muestra interés, obtén detalles completos con get_finca_details
6. Cotiza con get_quote
7. Guía el proceso de reserva con create_reservation
8. Envía link de pago con send_payment_link

CUÁNDO ESCALAR A UN ASESOR (usa escalate_to_advisor):
1. El cliente tiene quejas o reclamos
2. Solicita modificaciones complejas de reservas ya pagadas
3. Requiere factura o documento tributario especial
4. Menciona eventos corporativos o grupos >30 personas
5. Ha repetido la misma pregunta 3+ veces sin resolución
6. Expresa frustración explícita
7. Solicita hablar con una persona humana

FORMATO POR CANAL:
- WhatsApp: mensajes cortos, máximo 3 párrafos, bullets con emojis
- Instagram: mensajes muy concisos, respuestas rápidas
- Web: puedes ser más detallado, usa formato rico`,
      },
    },
    {
      key: "reminder_templates",
      category: "notifications",
      description: "Templates de mensajes de recordatorio",
      value: {
        pre_trip_info: "¡Hola {{name}}! 🌄 En {{days}} días comienza tu escapada a {{finca}}. Aquí tienes todo lo que necesitas saber para llegar: {{directions}}",
        logistics: "¡{{name}}, ya casi es hora! 🗺️ Mañana check-in en {{finca}} a las {{checkin_time}}. Dirección: {{address}}. Código de acceso: {{code}}",
        checkin_now: "¡Bienvenido a {{finca}}! 🏡 Ya puedes hacer el check-in. Si tienes alguna duda llama al propietario: {{owner_phone}}",
        post_stay: "Esperamos que {{name}} haya disfrutado su estadía en {{finca}}. ¿Nos cuentas cómo estuvo? Tu opinión nos ayuda a mejorar 🌟",
        reengagement_30: "¡{{name}}, han pasado 30 días desde tu última visita! Tenemos nuevas fincas disponibles en {{municipality}} que podrían gustarte 🌿",
        reengagement_60: "¡Hola {{name}}! Hace 2 meses exploraste fincas con nosotros. Tenemos descuentos especiales esta temporada 🎉",
        reengagement_90: "¡{{name}}, te extrañamos! Han pasado 3 meses. Como cliente especial tienes acceso anticipado a nuestras fincas premium del mes 🏆",
      },
    },
    {
      key: "max_context_messages",
      category: "bot",
      description: "Número máximo de mensajes a incluir en el contexto del LLM",
      value: 20,
    },
    {
      key: "session_ttl_hours",
      category: "bot",
      description: "Horas de vida de una sesión inactiva",
      value: 24,
    },
  ];

  for (const config of botConfigs) {
    await db.botConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }

  console.log(`✅ BotConfig: ${botConfigs.length} configuraciones`);

  // ─── AssignmentWeights ─────────────────────────────────────────────────────────
  await db.assignmentWeights.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      municipalityMatchPts: 10.0,
      penaltyPerActiveLead: 2.0,
      scheduleAvailablePts: 5.0,
      conversionRateMultiplier: 20.0,
      responseTimePenaltyPerHour: 1.0,
    },
  });

  console.log("✅ AssignmentWeights: configurado");

  // ─── Cupones ───────────────────────────────────────────────────────────────────
  await db.coupon.upsert({
    where: { code: "BIENVENIDO10" },
    update: {},
    create: {
      code: "BIENVENIDO10",
      discountType: DiscountType.PERCENT,
      discountValue: 10,
      maxUses: 1000,
      active: true,
      createdBy: admin.id,
    },
  });

  await db.coupon.upsert({
    where: { code: "PRIMER20" },
    update: {},
    create: {
      code: "PRIMER20",
      discountType: DiscountType.FIXED,
      discountValue: 20000,
      minOrderAmount: 200000,
      maxUses: 500,
      active: true,
      createdBy: admin.id,
    },
  });

  console.log("✅ Cupones: BIENVENIDO10 (10%) y PRIMER20 (COP 20.000 fijo)");

  console.log("\n🎉 Seed completado exitosamente!");
  console.log(`
  Credenciales de acceso:
  ┌─────────────────────────────────────────────────┐
  │ Admin:       admin@depaseoenfincas.co           │
  │ Asesores:    carlos.asesor@, maria.asesora@,   │
  │              juan.asesor@depaseoenfincas.co     │
  │ Propietarios: propietario1@, propietario2@      │
  │              finca.co                           │
  │ Clientes:    cliente1-5@gmail.com               │
  │ Password:    Paseo2025! (todos)                 │
  └─────────────────────────────────────────────────┘
  `);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
