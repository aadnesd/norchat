import { describe, expect, it } from "vitest";
import {
  buildChatPrompt,
  buildChatResponse,
  type SourceCitationInfo
} from "../chat-runtime.js";

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

  it("enriches sources with chunkId, excerpt and score", () => {
    const response = buildChatResponse({
      message: "refunds",
      context: [
        {
          id: "chunk_abc",
          sourceId: "source_xyz",
          content: "Refunds are processed within 30 days.",
          score: 0.85
        }
      ]
    });

    expect(response.sources).toHaveLength(1);
    const src = response.sources[0];
    expect(src.chunkId).toBe("chunk_abc");
    expect(src.sourceId).toBe("source_xyz");
    expect(src.score).toBe(0.85);
    expect(src.excerpt).toBe("Refunds are processed within 30 days.");
  });

  it("truncates long content to excerpt with ellipsis", () => {
    const longContent = "word ".repeat(100).trim(); // 499 chars
    const response = buildChatResponse({
      message: "test",
      context: [
        {
          id: "chunk_long",
          sourceId: "source_1",
          content: longContent,
          score: 0.5
        }
      ]
    });

    const src = response.sources[0];
    expect(src.excerpt!.length).toBeLessThanOrEqual(201); // 200 + ellipsis char
    expect(src.excerpt!.endsWith("\u2026")).toBe(true);
  });

  it("includes sourceType/URL/title from sourceLookup", () => {
    const sourceLookup = new Map<string, SourceCitationInfo>([
      [
        "source_web",
        {
          sourceId: "source_web",
          sourceType: "website",
          sourceUrl: "https://example.com/faq",
          sourceTitle: "FAQ Page"
        }
      ]
    ]);
    const response = buildChatResponse({
      message: "faq",
      context: [
        {
          id: "chunk_1",
          sourceId: "source_web",
          content: "Frequently asked questions about our service.",
          score: 0.9
        }
      ],
      sourceLookup
    });

    const src = response.sources[0];
    expect(src.sourceType).toBe("website");
    expect(src.sourceUrl).toBe("https://example.com/faq");
    expect(src.sourceTitle).toBe("FAQ Page");
  });

  it("falls back to chunk metadata when sourceLookup is missing", () => {
    const response = buildChatResponse({
      message: "billing",
      context: [
        {
          id: "chunk_m",
          sourceId: "source_m",
          content: "Billing is monthly.",
          score: 0.7,
          metadata: {
            sourceType: "text",
            sourceTitle: "Billing FAQ"
          }
        }
      ]
    });

    const src = response.sources[0];
    expect(src.sourceType).toBe("text");
    expect(src.sourceTitle).toBe("Billing FAQ");
    expect(src.sourceUrl).toBeUndefined();
  });

  it("uses source title in prompt when sourceLookup provided", () => {
    const sourceLookup = new Map<string, SourceCitationInfo>([
      [
        "source_doc",
        {
          sourceId: "source_doc",
          sourceType: "file",
          sourceTitle: "User Manual"
        }
      ]
    ]);
    const prompt = buildChatPrompt({
      basePrompt: "Answer concisely.",
      message: "How do I reset?",
      context: [
        {
          id: "chunk_1",
          sourceId: "source_doc",
          content: "To reset, hold the power button for 10 seconds.",
          score: 0.9
        }
      ],
      sourceLookup
    });

    expect(prompt).toContain("[1] (User Manual)");
    expect(prompt).not.toContain("source_doc");
  });

  it("falls back to sourceId when no title or URL in sourceLookup", () => {
    const sourceLookup = new Map<string, SourceCitationInfo>([
      [
        "source_plain",
        {
          sourceId: "source_plain",
          sourceType: "text"
        }
      ]
    ]);
    const prompt = buildChatPrompt({
      basePrompt: "Help the user.",
      message: "Tell me about returns",
      context: [
        {
          id: "chunk_1",
          sourceId: "source_plain",
          content: "Returns within 14 days.",
          score: 0.6
        }
      ],
      sourceLookup
    });

    expect(prompt).toContain("[1] (source_plain)");
  });
});
