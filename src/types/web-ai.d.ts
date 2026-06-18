// Minimal ambient types for Chrome's experimental on-device Prompt API.
// These are NOT in TypeScript's DOM lib. Runtime code feature-detects them;
// this only makes the wrapper in src/lib/ai/localModel.ts typecheck.

export type AiAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

export interface LanguageModelMonitor {
  addEventListener(
    type: "downloadprogress",
    listener: (event: { loaded: number }) => void,
  ): void;
}

export interface LanguageModelCreateOptions {
  monitor?: (monitor: LanguageModelMonitor) => void;
  initialPrompts?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

export interface LanguageModelPromptOptions {
  responseConstraint?: object;
}

export interface LanguageModelSession {
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  destroy(): void;
}

export interface LanguageModelStatic {
  availability(): Promise<AiAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelStatic | undefined;
  interface Window {
    LanguageModel?: LanguageModelStatic;
  }
}
