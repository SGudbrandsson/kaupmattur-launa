export type SpeechLang = "is-IS" | "en-US";

const LANGS: SpeechLang[] = ["is-IS", "en-US"];

interface RecognitionResultSeg {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResultSeg>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
interface RecognitionCtor {
  new (): Recognition;
  availableOnDevice?(lang: string): Promise<string>;
}

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Languages with on-device recognition. Empty unless the on-device API exists. */
export async function speechLangsAvailable(): Promise<SpeechLang[]> {
  const C = ctor();
  if (!C || typeof C.availableOnDevice !== "function") return [];
  const out: SpeechLang[] = [];
  for (const lang of LANGS) {
    try {
      const a = await C.availableOnDevice(lang);
      if (a === "available" || a === "downloadable" || a === "downloading") {
        out.push(lang);
      }
    } catch {
      /* ignore this language */
    }
  }
  return out;
}

export interface Dictation {
  start(): void;
  stop(): void;
}

export interface DictationHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: () => void;
  onEnd: () => void;
}

/** Create an on-device dictation session for `lang`. Throws if unsupported. */
export function createDictation(
  lang: SpeechLang,
  handlers: DictationHandlers,
): Dictation {
  const C = ctor();
  if (!C) throw new Error("SpeechRecognition unavailable");
  const rec = new C();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.processLocally = true; // keep audio on-device

  rec.onresult = (e) => {
    let finalText = "";
    let partial = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const seg = e.results[i];
      if (seg.isFinal) finalText += seg[0].transcript;
      else partial += seg[0].transcript;
    }
    if (finalText) handlers.onFinal(finalText);
    if (partial) handlers.onPartial(partial);
  };
  rec.onerror = () => handlers.onError();
  rec.onend = () => handlers.onEnd();

  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
  };
}
