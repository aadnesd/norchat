import { describe, expect, it } from "vitest";
import { buildChatPrompt, buildChatResponse } from "../chat-runtime.js";

describe("chat runtime helpers", () => {
  it("builds a prompt with base prompt and sources", () => {
    const prompt = buildChatPrompt({
      basePrompt: "Be crisp and cite sources.",
      message: "What is your refund policy?",
      context: [
        {
          id: "chunk_1",
          sourceId: "source_1",
          content: "Refunds are available within 30 days of purchase.",
          score: 0.82
        }
      ]
    });

    expect(prompt).toContain("Be crisp and cite sources");
    expect(prompt).toContain("What is your refund policy?");
    expect(prompt).toContain("source_1");
  });

  it("returns a low-confidence fallback when no context is available", () => {
    const response = buildChatResponse({
      message: "How do I update my billing details?",
      context: []
    });

    expect(response.shouldEscalate).toBe(true);
    expect(response.confidence).toBe(0);
    expect(response.message).toMatch(/couldn't find/i);
  });

  it("uses retrieved context to craft a response", () => {
    const response = buildChatResponse({
      message: "refunds",
      context: [
        {
          id: "chunk_2",
          sourceId: "source_9",
          content: "Refunds are processed within 30 days.",
          score: 0.74
        },
        {
          id: "chunk_3",
          sourceId: "source_10",
          content: "Shipping takes two business days.",
          score: 0.4
        }
      ]
    });

    expect(response.shouldEscalate).toBe(false);
    expect(response.message).toMatch(/refund/i);
    expect(response.sources.length).toBe(2);
  });
});
