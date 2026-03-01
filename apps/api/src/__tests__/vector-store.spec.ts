import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { LocalVectorStore } from "../vector-store.js";
import { buildEmbedding } from "../embeddings.js";

const buildRecord = (params: {
  id: string;
  agentId: string;
  sourceId: string;
  content: string;
  createdAt: string;
}) => ({
  ...params,
  embedding: buildEmbedding(params.content)
});

describe("local vector store retrieval", () => {
  let storeDir: string;
  let store: LocalVectorStore;

  beforeEach(async () => {
    storeDir = await mkdtemp(path.join(tmpdir(), "vector-store-spec-"));
    store = new LocalVectorStore(path.join(storeDir, "chunks.jsonl"));
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
  });

  it("reranks hybrid results to prefer exact phrase matches", async () => {
    const createdAt = new Date().toISOString();
    await store.upsert([
      buildRecord({
        id: "chunk_b",
        agentId: "agent_1",
        sourceId: "source_1",
        content: "policy refund details and steps",
        createdAt
      }),
      buildRecord({
        id: "chunk_a",
        agentId: "agent_1",
        sourceId: "source_1",
        content: "refund policy details and steps",
        createdAt
      })
    ]);

    const results = await store.query({
      agentId: "agent_1",
      queryText: "refund policy",
      queryEmbedding: buildEmbedding("refund policy"),
      minScore: 0,
      maxResults: 2
    });

    expect(results[0].chunk.content).toContain("refund policy");
  });

  it("returns accurate results within a reasonable latency budget", async () => {
    const createdAt = new Date().toISOString();
    const records = Array.from({ length: 120 }).map((_, index) =>
      buildRecord({
        id: `chunk_${index}`,
        agentId: "agent_2",
        sourceId: "source_2",
        content: `General support notice ${index} for account updates and billing details`,
        createdAt
      })
    );
    records.push(
      buildRecord({
        id: "chunk_target",
        agentId: "agent_2",
        sourceId: "source_2",
        content: "Refund policy window is 30 days for online purchases.",
        createdAt
      })
    );

    await store.upsert(records);

    const start = performance.now();
    const results = await store.query({
      agentId: "agent_2",
      queryText: "refund policy window",
      queryEmbedding: buildEmbedding("refund policy window"),
      minScore: 0,
      maxResults: 3
    });
    const duration = performance.now() - start;

    expect(results[0].chunk.content).toMatch(/refund policy window/i);
    expect(duration).toBeLessThan(300);
  });

  it("deletes records by sourceId", async () => {
    const createdAt = new Date().toISOString();
    await store.upsert([
      buildRecord({ id: "c1", agentId: "a1", sourceId: "s1", content: "source one chunk one", createdAt }),
      buildRecord({ id: "c2", agentId: "a1", sourceId: "s1", content: "source one chunk two", createdAt }),
      buildRecord({ id: "c3", agentId: "a1", sourceId: "s2", content: "source two chunk one", createdAt })
    ]);

    const deleted = await store.deleteBySourceId("s1");
    expect(deleted).toBe(2);

    const results = await store.query({
      agentId: "a1",
      queryText: "source one",
      queryEmbedding: buildEmbedding("source one"),
      minScore: 0,
      maxResults: 10
    });
    expect(results).toHaveLength(1);
    expect(results[0].chunk.sourceId).toBe("s2");
  });

  it("deletes records by agentId", async () => {
    const createdAt = new Date().toISOString();
    await store.upsert([
      buildRecord({ id: "c1", agentId: "a1", sourceId: "s1", content: "agent one data", createdAt }),
      buildRecord({ id: "c2", agentId: "a2", sourceId: "s2", content: "agent two data", createdAt }),
      buildRecord({ id: "c3", agentId: "a1", sourceId: "s3", content: "agent one more data", createdAt })
    ]);

    const deleted = await store.deleteByAgentId("a1");
    expect(deleted).toBe(2);

    const resultsA1 = await store.query({
      agentId: "a1",
      queryText: "agent data",
      queryEmbedding: buildEmbedding("agent data"),
      minScore: 0,
      maxResults: 10
    });
    expect(resultsA1).toHaveLength(0);

    const resultsA2 = await store.query({
      agentId: "a2",
      queryText: "agent data",
      queryEmbedding: buildEmbedding("agent data"),
      minScore: 0,
      maxResults: 10
    });
    expect(resultsA2).toHaveLength(1);
  });

  it("returns zero when deleting non-existent sourceId", async () => {
    const deleted = await store.deleteBySourceId("nonexistent");
    expect(deleted).toBe(0);
  });

  it("persists deletions across store reloads", async () => {
    const createdAt = new Date().toISOString();
    await store.upsert([
      buildRecord({ id: "c1", agentId: "a1", sourceId: "s1", content: "persistent chunk", createdAt }),
      buildRecord({ id: "c2", agentId: "a1", sourceId: "s2", content: "other persistent chunk", createdAt })
    ]);

    await store.deleteBySourceId("s1");

    // Create a fresh store pointing to the same file
    const reloadedStore = new LocalVectorStore(path.join(storeDir, "chunks.jsonl"));
    const results = await reloadedStore.query({
      agentId: "a1",
      queryText: "persistent chunk",
      queryEmbedding: buildEmbedding("persistent chunk"),
      minScore: 0,
      maxResults: 10
    });
    expect(results).toHaveLength(1);
    expect(results[0].chunk.sourceId).toBe("s2");
  });
});
