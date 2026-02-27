export type Embedding = Record<string, number>;

const normalizeToken = (token: string) => {
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
};

export const tokenizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/giu, " ")
    .split(/\s+/u)
    .map((token) => normalizeToken(token.trim()))
    .filter((token) => token.length > 0);

export const buildEmbedding = (text: string): Embedding => {
  const embedding: Embedding = {};
  for (const token of tokenizeText(text)) {
    embedding[token] = (embedding[token] ?? 0) + 1;
  }
  return embedding;
};

export const computeSimilarity = (
  queryEmbedding: Embedding,
  chunkEmbedding: Embedding
) => {
  let dot = 0;
  let queryNorm = 0;
  let chunkNorm = 0;
  for (const value of Object.values(queryEmbedding)) {
    queryNorm += value * value;
  }
  for (const value of Object.values(chunkEmbedding)) {
    chunkNorm += value * value;
  }
  if (queryNorm === 0 || chunkNorm === 0) {
    return 0;
  }
  for (const [token, value] of Object.entries(queryEmbedding)) {
    const chunkValue = chunkEmbedding[token];
    if (chunkValue) {
      dot += value * chunkValue;
    }
  }
  return dot / (Math.sqrt(queryNorm) * Math.sqrt(chunkNorm));
};
