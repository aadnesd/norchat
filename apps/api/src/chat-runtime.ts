export type ChatContextChunk = {
  id: string;
  sourceId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type ChatPromptInput = {
  basePrompt?: string;
  message: string;
  context: ChatContextChunk[];
};

export type ChatResponse = {
  message: string;
  sources: Array<Pick<ChatContextChunk, "id" | "sourceId" | "score">>;
  confidence: number;
  shouldEscalate: boolean;
};

const DEFAULT_PROMPT =
  "You are a helpful support assistant for a Norwegian business. " +
  "Answer using the provided sources when possible and keep answers concise.";

export const buildChatPrompt = ({
  basePrompt,
  message,
  context
}: ChatPromptInput) => {
  const promptParts = [basePrompt ?? DEFAULT_PROMPT, ""];
  if (context.length > 0) {
    const contextLines = context.map((chunk, index) => {
      return `[${index + 1}] (${chunk.sourceId}) ${chunk.content}`;
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

export const buildChatResponse = ({
  message,
  context
}: {
  message: string;
  context: ChatContextChunk[];
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
      : `Here's what I found about \"${message}\". Let me know if you want more details.`;

  return {
    message: responseMessage,
    sources: context.map((chunk) => ({
      id: chunk.id,
      sourceId: chunk.sourceId,
      score: chunk.score
    })),
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
