export type ChatContextChunk = {
  id: string;
  sourceId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type SourceCitationInfo = {
  sourceId: string;
  sourceType: string;
  sourceUrl?: string;
  sourceTitle?: string;
};

export type ChatPromptInput = {
  basePrompt?: string;
  message: string;
  context: ChatContextChunk[];
};

export type EnrichedSource = {
  chunkId: string;
  sourceId: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  score: number;
  excerpt?: string;
};

export type ChatResponse = {
  message: string;
  sources: EnrichedSource[];
  confidence: number;
  shouldEscalate: boolean;
};

const DEFAULT_PROMPT =
  "You are a helpful support assistant for a Norwegian business. " +
  "Answer using the provided sources when possible and keep answers concise.";

export const buildChatPrompt = ({
  basePrompt,
  message,
  context,
  sourceLookup
}: ChatPromptInput & { sourceLookup?: Map<string, SourceCitationInfo> }) => {
  const promptParts = [basePrompt ?? DEFAULT_PROMPT, ""];
  if (context.length > 0) {
    const contextLines = context.map((chunk, index) => {
      const info = sourceLookup?.get(chunk.sourceId);
      const label = info?.sourceTitle ?? info?.sourceUrl ?? chunk.sourceId;
      return `[${index + 1}] (${label}) ${chunk.content}`;
    });
    promptParts.push("Sources:");
    promptParts.push(...contextLines);
    promptParts.push("");
  }
  promptParts.push(`User: ${message}`);
  promptParts.push("Assistant:");
  return promptParts.join("\n");
};

const buildSummaryAnswer = (context: ChatContextChunk[]) => {
  const excerpts = context.slice(0, 3).map((chunk) => chunk.content.trim());
  if (excerpts.length === 0) {
    return "";
  }
  return excerpts.join(" ");
};

const calculateConfidence = (context: ChatContextChunk[]) => {
  if (context.length === 0) {
    return 0;
  }
  const average =
    context.reduce((sum, chunk) => sum + chunk.score, 0) / context.length;
  return Math.max(0, Math.min(1, average));
};

const EXCERPT_MAX_LENGTH = 200;

const buildExcerpt = (content: string): string => {
  if (content.length <= EXCERPT_MAX_LENGTH) {
    return content.trim();
  }
  return content.slice(0, EXCERPT_MAX_LENGTH).trim() + "…";
};

export const buildChatResponse = ({
  message,
  context,
  sourceLookup
}: {
  message: string;
  context: ChatContextChunk[];
  sourceLookup?: Map<string, SourceCitationInfo>;
}): ChatResponse => {
  if (context.length === 0) {
    return {
      message:
        "I couldn't find that in the knowledge base yet. Want me to connect you with a teammate or help you rephrase?",
      sources: [],
      confidence: 0,
      shouldEscalate: true
    };
  }

  const summary = buildSummaryAnswer(context);
  const confidence = calculateConfidence(context);
  const responseMessage =
    summary.length > 0
      ? `${summary} If you need more details, I can pull additional sources.`
      : `Here's what I found about "${message}". Let me know if you want more details.`;

  return {
    message: responseMessage,
    sources: context.map((chunk) => {
      const info = sourceLookup?.get(chunk.sourceId);
      const metaTitle =
        chunk.metadata?.["sourceTitle"] as string | undefined;
      const metaUrl = chunk.metadata?.["sourceUrl"] as string | undefined;
      const metaType =
        chunk.metadata?.["sourceType"] as string | undefined;
      return {
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        sourceType: info?.sourceType ?? metaType,
        sourceUrl: info?.sourceUrl ?? metaUrl,
        sourceTitle: info?.sourceTitle ?? metaTitle,
        score: chunk.score,
        excerpt: buildExcerpt(chunk.content)
      };
    }),
    confidence,
    shouldEscalate: confidence < 0.35
  };
};

export const chunkResponseForStreaming = (text: string) => {
  const words = text.split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let cursor = 0;
  const step = 6;
  while (cursor < words.length) {
    const next = words.slice(cursor, cursor + step).join(" ");
    chunks.push(next);
    cursor += step;
  }
  return chunks;
};
