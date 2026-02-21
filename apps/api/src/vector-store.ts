import { promises as fs } from "node:fs";
import path from "node:path";
import type { Embedding } from "./embeddings.js";
import { computeSimilarity } from "./embeddings.js";

export type VectorRecord = {
  id: string;
  agentId: string;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: Embedding;
  createdAt: string;
};

export type VectorQuery = {
  agentId: string;
  queryEmbedding: Embedding;
  minScore: number;
  maxResults: number;
  sourceFilter?: Set<string>;
};

export type RetrievalMatch = {
  chunk: {
    id: string;
    sourceId: string;
    content: string;
    metadata?: Record<string, unknown>;
  };
  score: number;
};

export type VectorStore = {
  upsert(records: VectorRecord[]): Promise<void>;
  query(params: VectorQuery): Promise<RetrievalMatch[]>;
};

const sanitizeRegion = (region: string) =>
  region.toLowerCase().replace(/[^a-z0-9-_]+/giu, "_");

export class LocalVectorStore implements VectorStore {
  private records = new Map<string, VectorRecord>();
  private loaded = false;

  constructor(private filePath: string) {}

  async load() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const data = await fs.readFile(this.filePath, "utf8");
      const lines = data.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as VectorRecord;
          if (record?.id) {
            this.records.set(record.id, record);
          }
        } catch {
          // Skip malformed lines; keep loading others.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async upsert(records: VectorRecord[]) {
    await this.load();
    if (records.length === 0) {
      return;
    }
    for (const record of records) {
      this.records.set(record.id, record);
    }
    await this.persist();
  }

  async query({
    agentId,
    queryEmbedding,
    minScore,
    maxResults,
    sourceFilter
  }: VectorQuery): Promise<RetrievalMatch[]> {
    await this.load();
    return Array.from(this.records.values())
      .filter((record) => {
        if (record.agentId !== agentId) {
          return false;
        }
        if (sourceFilter && !sourceFilter.has(record.sourceId)) {
          return false;
        }
        return true;
      })
      .map((record) => ({
        record,
        score: computeSimilarity(queryEmbedding, record.embedding)
      }))
      .filter((item) => item.score > minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((item) => ({
        chunk: {
          id: item.record.id,
          sourceId: item.record.sourceId,
          content: item.record.content,
          metadata: item.record.metadata
        },
        score: item.score
      }));
  }

  private async persist() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    const lines = Array.from(this.records.values()).map((record) =>
      JSON.stringify(record)
    );
    const data = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    await fs.writeFile(tmpPath, data, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

export type RegionalVectorStore = {
  upsert(region: string, records: VectorRecord[]): Promise<void>;
  query(region: string, params: VectorQuery): Promise<RetrievalMatch[]>;
};

export const createRegionalVectorStore = (
  baseDir: string
): RegionalVectorStore => {
  const stores = new Map<string, LocalVectorStore>();

  const getStore = async (region: string) => {
    const safeRegion = sanitizeRegion(region);
    const cached = stores.get(safeRegion);
    if (cached) {
      return cached;
    }
    const store = new LocalVectorStore(
      path.join(baseDir, safeRegion, "chunks.jsonl")
    );
    await store.load();
    stores.set(safeRegion, store);
    return store;
  };

  return {
    async upsert(region, records) {
      const store = await getStore(region);
      await store.upsert(records);
    },
    async query(region, params) {
      const store = await getStore(region);
      return store.query(params);
    }
  };
};
