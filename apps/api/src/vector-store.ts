import { promises as fs } from "node:fs";
import path from "node:path";
import type { Embedding } from "./embeddings.js";
import { computeSimilarity, tokenizeText } from "./embeddings.js";

const HYBRID_VECTOR_WEIGHT = 0.6;
const HYBRID_LEXICAL_WEIGHT = 0.4;

const buildTermFrequency = (tokens: string[]) => {
  const termFrequency: Record<string, number> = {};
  for (const token of tokens) {
    termFrequency[token] = (termFrequency[token] ?? 0) + 1;
  }
  return termFrequency;
};

const computeBm25Score = ({
  queryTermFrequency,
  termFrequency,
  documentLength,
  avgDocumentLength,
  documentFrequencies,
  documentCount
}: {
  queryTermFrequency: Record<string, number>;
  termFrequency: Record<string, number>;
  documentLength: number;
  avgDocumentLength: number;
  documentFrequencies: Map<string, number>;
  documentCount: number;
}) => {
  if (documentLength === 0 || documentCount === 0) {
    return 0;
  }
  const k1 = 1.2;
  const b = 0.75;
  let score = 0;
  for (const [term, qtf] of Object.entries(queryTermFrequency)) {
    if (qtf <= 0) {
      continue;
    }
    const tf = termFrequency[term] ?? 0;
    if (tf === 0) {
      continue;
    }
    const df = documentFrequencies.get(term) ?? 0;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const normalization = tf + k1 * (1 - b + b * (documentLength / avgDocumentLength));
    score += idf * ((tf * (k1 + 1)) / normalization);
  }
  return score;
};

const computeCoverageScore = (
  queryTokens: string[],
  termFrequency: Record<string, number>
) => {
  const uniqueTokens = Array.from(new Set(queryTokens));
  if (uniqueTokens.length === 0) {
    return 0;
  }
  let matched = 0;
  for (const token of uniqueTokens) {
    if (termFrequency[token]) {
      matched += 1;
    }
  }
  return matched / uniqueTokens.length;
};

const computeProximityScore = (
  queryTokens: string[],
  contentTokens: string[]
) => {
  const requiredTokens = Array.from(new Set(queryTokens));
  if (requiredTokens.length === 0) {
    return 0;
  }
  const requiredSet = new Set(requiredTokens);
  const counts = new Map<string, number>();
  let matched = 0;
  let left = 0;
  let bestWindow = Number.POSITIVE_INFINITY;

  for (let right = 0; right < contentTokens.length; right += 1) {
    const token = contentTokens[right];
    if (requiredSet.has(token)) {
      const nextCount = (counts.get(token) ?? 0) + 1;
      counts.set(token, nextCount);
      if (nextCount === 1) {
        matched += 1;
      }
    }

    while (matched === requiredSet.size && left <= right) {
      bestWindow = Math.min(bestWindow, right - left + 1);
      const leftToken = contentTokens[left];
      if (requiredSet.has(leftToken)) {
        const nextCount = (counts.get(leftToken) ?? 0) - 1;
        if (nextCount <= 0) {
          counts.delete(leftToken);
          matched -= 1;
        } else {
          counts.set(leftToken, nextCount);
        }
      }
      left += 1;
    }
  }

  if (!Number.isFinite(bestWindow)) {
    return 0;
  }
  return 1 / bestWindow;
};

const computeRerankScore = ({
  queryTokens,
  contentTokens,
  termFrequency,
  hybridScore
}: {
  queryTokens: string[];
  contentTokens: string[];
  termFrequency: Record<string, number>;
  hybridScore: number;
}) => {
  const coverageScore = computeCoverageScore(queryTokens, termFrequency);
  const proximityScore = computeProximityScore(queryTokens, contentTokens);
  const normalizedQuery = queryTokens.join(" ");
  const normalizedContent = contentTokens.join(" ");
  const phraseScore =
    normalizedQuery.length > 0 && normalizedContent.includes(normalizedQuery)
      ? 1
      : 0;

  return (
    hybridScore * 0.6 +
    coverageScore * 0.25 +
    proximityScore * 0.1 +
    phraseScore * 0.05
  );
};

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
  queryText: string;
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
    queryText,
    queryEmbedding,
    minScore,
    maxResults,
    sourceFilter
  }: VectorQuery): Promise<RetrievalMatch[]> {
    await this.load();
    const filteredRecords = Array.from(this.records.values()).filter(
      (record) => {
        if (record.agentId !== agentId) {
          return false;
        }
        if (sourceFilter && !sourceFilter.has(record.sourceId)) {
          return false;
        }
        return true;
      }
    );

    if (filteredRecords.length === 0) {
      return [];
    }

    const queryTokens = tokenizeText(queryText);
    const queryTermFrequency = buildTermFrequency(queryTokens);
    const queryTokenSet = new Set(Object.keys(queryTermFrequency));

    const documentFrequencies = new Map<string, number>();
    let totalDocumentLength = 0;

    const scoredRecords = filteredRecords.map((record) => {
      const tokens = tokenizeText(record.content);
      const termFrequency = buildTermFrequency(tokens);
      const documentLength = Object.values(termFrequency).reduce(
        (sum, value) => sum + value,
        0
      );
      totalDocumentLength += documentLength;

      if (queryTokenSet.size > 0) {
        for (const token of queryTokenSet) {
          if (termFrequency[token]) {
            documentFrequencies.set(
              token,
              (documentFrequencies.get(token) ?? 0) + 1
            );
          }
        }
      }

      return {
        record,
        tokens,
        termFrequency,
        documentLength,
        vectorScore: computeSimilarity(queryEmbedding, record.embedding),
        lexicalScore: 0
      };
    });

    const avgDocumentLength =
      totalDocumentLength > 0 ? totalDocumentLength / scoredRecords.length : 1;

    for (const item of scoredRecords) {
      item.lexicalScore = computeBm25Score({
        queryTermFrequency,
        termFrequency: item.termFrequency,
        documentLength: item.documentLength,
        avgDocumentLength,
        documentFrequencies,
        documentCount: scoredRecords.length
      });
    }

    const lexicalScores = scoredRecords.map((item) => item.lexicalScore);
    const minLexical = Math.min(...lexicalScores);
    const maxLexical = Math.max(...lexicalScores);
    const lexicalRange =
      maxLexical > minLexical ? maxLexical - minLexical : 0;

    const hybridCandidates = scoredRecords
      .map((item) => {
        const normalizedLexical =
          lexicalRange > 0 ? (item.lexicalScore - minLexical) / lexicalRange : 0;
        const hybridScore =
          HYBRID_VECTOR_WEIGHT * item.vectorScore +
          HYBRID_LEXICAL_WEIGHT * normalizedLexical;
        return {
          ...item,
          normalizedLexical,
          hybridScore
        };
      })
      .filter((item) => item.hybridScore > minScore)
      .sort((a, b) => b.hybridScore - a.hybridScore);

    if (hybridCandidates.length === 0) {
      return [];
    }

    const rerankCount = Math.min(
      hybridCandidates.length,
      Math.max(maxResults * 3, maxResults)
    );
    const reranked = hybridCandidates.slice(0, rerankCount).map((item) => {
      const rerankScore = computeRerankScore({
        queryTokens,
        contentTokens: item.tokens,
        termFrequency: item.termFrequency,
        hybridScore: item.hybridScore
      });
      return { ...item, rerankScore };
    });

    reranked.sort((a, b) => b.rerankScore - a.rerankScore);

    return reranked
      .slice(0, maxResults)
      .map((item) => ({
        chunk: {
          id: item.record.id,
          sourceId: item.record.sourceId,
          content: item.record.content,
          metadata: item.record.metadata
        },
        score: item.rerankScore
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
