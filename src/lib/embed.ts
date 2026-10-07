// Turning text into vectors, with Voyage AI's embeddings API. The key is the
// VOYAGE_API_KEY secret (a Fly secret in production, mise.local.toml
// locally) and never leaves the server. With no key, or Voyage down, embed()
// answers null and search falls back to matching words.

const MODEL = "voyage-4-lite";
const DIMENSIONS = 512;

/** Names the vectors this produces; a different model means re-embedding. */
export const EMBEDDING_MODEL = `${MODEL}/${DIMENSIONS}`;

export const canEmbed = () => Boolean(process.env.VOYAGE_API_KEY);

/**
 * One vector per text, unit length. `document` for the cards being searched,
 * `query` for what someone typed: Voyage tunes the two differently.
 */
export async function embed(texts: string[], inputType: "document" | "query"): Promise<Float32Array[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key || texts.length === 0) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType, output_dimension: DIMENSIONS }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`embed: Voyage answered ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const out: Float32Array[] = [];
    for (const { embedding, index } of body.data) out[index] = unit(Float32Array.from(embedding));
    return out.length === texts.length && out.every(Boolean) ? out : null;
  } catch (error) {
    console.warn(`embed: Voyage unreachable (${(error as Error).name})`);
    return null;
  }
}

function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}
