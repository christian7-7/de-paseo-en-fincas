import OpenAI from "openai";
import { db } from "@repo/db";
import type { KnowledgeChunkType, Finca } from "@repo/db";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10);

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // token limit safety
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

export async function searchKnowledge(
  query: string,
  type?: KnowledgeChunkType,
  limit = 5
): Promise<Array<{ content: string; metadata: unknown; similarity: number }>> {
  try {
    const embedding = await generateEmbedding(query);
    const embeddingStr = `[${embedding.join(",")}]`;

    // pgvector cosine similarity query via raw SQL
    const typeFilter = type ? `AND type = '${type}'` : "";

    const results = await db.$queryRawUnsafe<
      Array<{ id: string; content: string; metadata: unknown; similarity: number }>
    >(
      `
      SELECT id, content, metadata,
             1 - (embedding <=> '${embeddingStr}'::vector) AS similarity
      FROM knowledge_chunks
      WHERE embedding IS NOT NULL
      ${typeFilter}
      ORDER BY embedding <=> '${embeddingStr}'::vector
      LIMIT ${limit}
      `
    );

    return results.map((r) => ({
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity,
    }));
  } catch (error) {
    console.error("[RAG] searchKnowledge error:", error);
    // Fallback: keyword search
    const chunks = await db.knowledgeChunk.findMany({
      where: type ? { type } : {},
      take: limit,
    });
    return chunks.map((c) => ({ content: c.content, metadata: c.metadata, similarity: 0 }));
  }
}

export async function indexFinca(finca: Finca): Promise<void> {
  const text = `
    Finca: ${finca.name}
    Municipio: ${finca.municipality}, ${finca.department}
    Descripción: ${finca.description}
    Capacidad: ${finca.capacity} personas
    Habitaciones: ${finca.bedrooms}, Baños: ${finca.bathrooms}
    Precio por noche: $${finca.pricePerNight.toLocaleString("es-CO")} COP
    Amenidades: ${finca.amenities.join(", ")}
    Política de cancelación: ${finca.cancellationPolicy}
    Noches mínimas: ${finca.minNights}
  `.trim();

  try {
    const embedding = await generateEmbedding(text);

    // Upsert knowledge chunk for finca
    const existing = await db.knowledgeChunk.findFirst({
      where: { type: "FINCA", sourceId: finca.id },
    });

    if (existing) {
      await db.$executeRawUnsafe(
        `UPDATE knowledge_chunks SET content = $1, metadata = $2, embedding = $3::vector, "updatedAt" = NOW() WHERE id = $4`,
        text,
        JSON.stringify({ fincaId: finca.id, municipality: finca.municipality }),
        `[${embedding.join(",")}]`,
        existing.id
      );
    } else {
      const id = `kc_${finca.id}`;
      await db.$executeRawUnsafe(
        `INSERT INTO knowledge_chunks (id, type, "sourceId", content, metadata, embedding, "updatedAt")
         VALUES ($1, 'FINCA', $2, $3, $4, $5::vector, NOW())
         ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, "updatedAt" = NOW()`,
        id,
        finca.id,
        text,
        JSON.stringify({ fincaId: finca.id, municipality: finca.municipality }),
        `[${embedding.join(",")}]`
      );
    }
  } catch (error) {
    console.error(`[RAG] indexFinca error for ${finca.id}:`, error);
    throw error;
  }
}

export async function indexFAQ(question: string, answer: string): Promise<void> {
  const text = `Q: ${question}\nA: ${answer}`;

  try {
    const embedding = await generateEmbedding(text);
    const id = `faq_${Buffer.from(question).toString("base64").slice(0, 20)}`;

    await db.$executeRawUnsafe(
      `INSERT INTO knowledge_chunks (id, type, content, metadata, embedding, "updatedAt")
       VALUES ($1, 'FAQ', $2, $3, $4::vector, NOW())
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, "updatedAt" = NOW()`,
      id,
      text,
      JSON.stringify({ question }),
      `[${embedding.join(",")}]`
    );
  } catch (error) {
    console.error("[RAG] indexFAQ error:", error);
    throw error;
  }
}
