import OpenAI from "openai";
import type {
  EmbeddingRequest,
  EmbeddingResponse,
  TextChunk,
  ChunkOptions,
} from "./types.js";
import { OPENAI_API_KEY } from "../../shared/env.js";
import { getMakeLogger } from "../../lib/logger.js";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const log = getMakeLogger("vector-embeddings");

/****************************************************
 Constants
****************************************************/
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large";
const MAX_TOKENS_PER_REQUEST = 8000; // Conservative limit for embeddings
const MAX_CHARS_PER_CHUNK = 32000; // Approximate character limit

/****************************************************
 Embedding Cache
****************************************************/
class EmbeddingCache {
  private cache = new Map<string, { embedding: number[]; timestamp: number }>();
  private readonly ttl = 1000 * 60 * 60; // 1 hour TTL

  private getCacheKey(content: string, model: string): string {
    // Simple hash for cache key
    return `${model}:${Buffer.from(content).toString("base64").slice(0, 64)}`;
  }

  get(content: string, model: string): number[] | null {
    const key = this.getCacheKey(content, model);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.embedding;
  }

  set(content: string, model: string, embedding: number[]): void {
    const key = this.getCacheKey(content, model);
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const embeddingCache = new EmbeddingCache();

/****************************************************
 Text Chunking Utilities
****************************************************/
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const {
    maxTokens = MAX_TOKENS_PER_REQUEST,
    overlapTokens = 200,
    preserveSentences = true,
  } = options;

  // Rough token estimation (1 token ≈ 4 characters)
  const maxChars = Math.min(maxTokens * 4, MAX_CHARS_PER_CHUNK);
  const overlapChars = overlapTokens * 4;

  if (text.length <= maxChars) {
    return [
      {
        content: text,
        index: 0,
        totalChunks: 1,
        tokenCount: estimateTokenCount(text),
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + maxChars, text.length);

    // If preserving sentences, try to end at sentence boundary
    if (preserveSentences && endIndex < text.length) {
      const sentenceEnd = text.lastIndexOf(".", endIndex);
      if (sentenceEnd > startIndex + maxChars * 0.5) {
        endIndex = sentenceEnd + 1;
      }
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push({
        content: chunk,
        index: chunks.length,
        totalChunks: 0, // Will be updated after all chunks are created
        tokenCount: estimateTokenCount(chunk),
      });
    }

    // Move start index with overlap
    startIndex = endIndex - overlapChars;
    if (startIndex >= endIndex) {
      startIndex = endIndex;
    }
  }

  // Update total chunk count
  chunks.forEach((chunk) => {
    chunk.totalChunks = chunks.length;
  });

  return chunks;
}

function estimateTokenCount(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/****************************************************
 Embedding Generation
****************************************************/
export async function generateEmbedding(
  request: EmbeddingRequest
): Promise<EmbeddingResponse> {
  const model = request.model || DEFAULT_EMBEDDING_MODEL;
  const startTime = Date.now();

  try {
    // Check cache first
    const cachedEmbedding = embeddingCache.get(request.content, model);
    if (cachedEmbedding) {
      log.debug(
        "embedding-cache",
        `Cache hit for content (${request.content.length} chars)`
      );
      return {
        embedding: cachedEmbedding,
        model,
        usage: {
          prompt_tokens: estimateTokenCount(request.content),
          total_tokens: estimateTokenCount(request.content),
        },
      };
    }

    // Generate embedding
    const response = await openai.embeddings.create({
      model,
      input: request.content,
      encoding_format: "float",
    });

    const embedding = response.data[0].embedding;
    const usage = response.usage;

    // Cache the result
    embeddingCache.set(request.content, model, embedding);

    const duration = Date.now() - startTime;
    log.debug(
      "embedding-generated",
      `Generated embedding for ${request.content.length} chars in ${duration}ms`
    );

    return {
      embedding,
      model,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        total_tokens: usage.total_tokens,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(
      "embedding-error",
      `Failed to generate embedding after ${duration}ms: ${error}`
    );
    throw new Error(`Embedding generation failed: ${error}`);
  }
}

/****************************************************
 Batch Embedding Generation -- unused, can be removed
****************************************************/
export async function generateBatchEmbeddings(
  requests: EmbeddingRequest[]
): Promise<EmbeddingResponse[]> {
  const startTime = Date.now();

  try {
    const results = await Promise.all(
      requests.map((request) => generateEmbedding(request))
    );

    const duration = Date.now() - startTime;
    log.debug(
      "batch-embedding",
      `Generated ${requests.length} embeddings in ${duration}ms`
    );

    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(
      "batch-embedding-error",
      `Batch embedding generation failed after ${duration}ms: ${error}`
    );
    throw error;
  }
}

/****************************************************
 Content Formatting for Embeddings
****************************************************/
export function formatSummaryForEmbedding(summary: {
  title: string;
  description: string;
  topics: string[];
}): string {
  const topicsText =
    summary.topics.length > 0 ? `Topics: ${summary.topics.join(", ")}` : "";

  return `Call Summary: ${summary.title}. ${summary.description}. ${topicsText}`.trim();
}

export function formatTranscriptForEmbedding(
  turns: Array<{
    role: string;
    content?: string;
    type?: string;
    origin?: string;
  }>
): string {
  return turns
    .filter((turn) => {
      // Filter out filler and tool turns
      if (turn.type === "tool") return false;
      if (turn.origin === "filler") return false;
      // Filter out turns without content
      if (!turn.content) return false;
      return true;
    })
    .map((turn) => {
      const role = turn.role.toUpperCase();
      return `[${role}]: ${turn.content}`;
    })
    .join("\n\n");
}

/****************************************************
 Utility Functions
****************************************************/
export function getCacheStats() {
  return {
    size: embeddingCache.size(),
    clearCache: () => embeddingCache.clear(),
  };
}

export function validateEmbedding(embedding: number[]): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === 1536 && // text-embedding-3-large dimension
    embedding.every((val) => typeof val === "number" && !isNaN(val))
  );
}
