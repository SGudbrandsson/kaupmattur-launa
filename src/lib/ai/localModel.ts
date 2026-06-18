import type { AiAvailability, LanguageModelStatic } from "../../types/web-ai";
import type { RawRow } from "./normalizeRows";

const SYSTEM_PROMPT = [
  "You extract a salary history from the user's message.",
  "The user may write in Icelandic or English, with informal numbers",
  "(e.g. '650þ', '650 thousand', '0.8m' all mean ISK amounts).",
  "Return every salary level the user states, as objects with:",
  '- "month": the year-month it took effect, formatted strictly as "YYYY-MM".',
  '- "amount": the monthly salary as an integer number of Icelandic krónur.',
  "If only a year is given, use month 01. If the user says 'now'/'í dag',",
  "use the most recent plausible month. Output only the structured data.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          month: { type: "string" },
          amount: { type: "number" },
        },
        required: ["month", "amount"],
      },
    },
  },
  required: ["rows"],
} as const;

function model(): LanguageModelStatic | undefined {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

export async function modelAvailability(): Promise<AiAvailability> {
  const lm = model();
  if (!lm) return "unavailable";
  try {
    return await lm.availability();
  } catch {
    return "unavailable";
  }
}

export interface Extractor {
  /** Parse a fresh free-text description into rows. */
  extract(text: string): Promise<RawRow[]>;
  /** Apply a correction in the same conversation; returns the full new set. */
  refine(instruction: string): Promise<RawRow[]>;
  destroy(): void;
}

/**
 * Create an extraction session. If the model needs downloading, `onProgress`
 * receives a 0..1 fraction. Throws if the API is unavailable.
 */
export async function createExtractor(
  onProgress?: (fraction: number) => void,
): Promise<Extractor> {
  const lm = model();
  if (!lm) throw new Error("LanguageModel unavailable");

  const session = await lm.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
    monitor: onProgress
      ? (m) =>
          m.addEventListener("downloadprogress", (e) => onProgress(e.loaded))
      : undefined,
  });

  async function run(input: string): Promise<RawRow[]> {
    const out = await session.prompt(input, {
      responseConstraint: RESPONSE_SCHEMA,
    });
    try {
      const parsed = JSON.parse(out) as { rows?: RawRow[] };
      return Array.isArray(parsed.rows) ? parsed.rows : [];
    } catch {
      return [];
    }
  }

  return {
    extract: (text) => run(text),
    refine: (instruction) => run(instruction),
    destroy: () => session.destroy(),
  };
}
