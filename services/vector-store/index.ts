import { Pinecone } from "@pinecone-database/pinecone";
import type {
  VectorStoreConfig,
  ConversationMetadata,
  StorageResult,
  RetrievalResult,
  QueryOptions,
  ContextRetrievalOptions,
  ConversationMatch,
  UserHistoryContext,
  TopicContext,
  DetailedContext,
  HealthStatus,
  VectorDocument,
} from "./types.js";
import type { TurnRecord } from "../../shared/session/turns.js";
import type { CallSummary } from "../../modules/summarization/types.js";
import {
  generateEmbedding,
  formatSummaryForEmbedding,
  formatTranscriptForEmbedding,
  chunkText,
} from "./embeddings.js";
import { PINECONE_API_KEY, PINECONE_INDEX_NAME } from "../../shared/env.js";
import { getMakeLogger } from "../../lib/logger.js";

export class VectorStoreService {
  private pinecone: Pinecone;
  private index: any; // Pinecone Index type
  private log: ReturnType<typeof getMakeLogger>;
  private config: VectorStoreConfig;

  constructor(config?: Partial<VectorStoreConfig>) {
    this.config = {
      apiKey: PINECONE_API_KEY,
      indexName: PINECONE_INDEX_NAME,
      embeddingModel: "text-embedding-3-large",
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };

    this.log = getMakeLogger("vector-store");
    this.pinecone = new Pinecone({
      apiKey: this.config.apiKey,
    });

    this.index = this.pinecone.index(this.config.indexName);
  }

  /****************************************************
   Health Check and Initialization
  ****************************************************/
  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const stats = await this.index.describeIndexStats();
      const processingTime = Date.now() - startTime;

      this.log.debug(
        "health-check",
        `Health check completed in ${processingTime}ms`
      );

      return {
        isHealthy: true,
        indexStats: {
          vectorCount: stats.totalVectorCount || 0,
          indexSize: stats.indexFullness || 0,
          dimension: stats.dimension || 1536,
        },
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log.error(
        "health-check",
        `Health check failed after ${processingTime}ms: ${error}`
      );

      return {
        isHealthy: false,
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /****************************************************
   Summary Storage
  ****************************************************/
  async storeSummary(
    callSid: string,
    summary: CallSummary,
    metadata: ConversationMetadata
  ): Promise<StorageResult> {
    const startTime = Date.now();

    try {
      // Format content for embedding
      const content = formatSummaryForEmbedding(summary);

      // Generate embedding
      const embeddingStart = Date.now();
      const embeddingResponse = await generateEmbedding({ content });
      const embeddingTime = Date.now() - embeddingStart;

      // Create document
      const documentId = `summary_${callSid}`;
      const vectorMetadata = {
        ...metadata,
        contentType: "summary" as const,
        recordType: "call_summary" as const,
        summaryVersion: 1,
        topics: summary.topics || [],
        lastUpdated: Date.now(), // Store as Unix timestamp for range queries
        // Store the actual formatted content for retrieval
        originalContent: content,
        // Keep ISO string for human readability
        callStartTimeISO: metadata.callStartTime,
        // Convert to Unix timestamp for filtering
        callStartTime: new Date(metadata.callStartTime).getTime(),
      };

      // Store in Pinecone
      const storageStart = Date.now();
      await this.index.upsert([
        {
          id: documentId,
          values: embeddingResponse.embedding,
          metadata: vectorMetadata,
        },
      ]);
      const storageTime = Date.now() - storageStart;

      const totalTime = Date.now() - startTime;
      this.log.info(
        "summary-stored",
        `Stored summary for ${callSid} in ${totalTime}ms (embed: ${embeddingTime}ms, store: ${storageTime}ms)`
      );

      return {
        success: true,
        documentIds: [documentId],
        metrics: {
          processingTime: totalTime,
          embeddingTime,
          storageTime,
        },
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log.error(
        "summary-storage-error",
        `Failed to store summary for ${callSid} after ${totalTime}ms: ${errorMessage}`
      );

      return {
        success: false,
        documentIds: [],
        error: errorMessage,
        metrics: {
          processingTime: totalTime,
          embeddingTime: 0,
          storageTime: 0,
        },
      };
    }
  }

  /****************************************************
   Summary Update
  ****************************************************/
  async updateSummary(
    callSid: string,
    summary: CallSummary,
    metadata: ConversationMetadata
  ): Promise<StorageResult> {
    // For updates, we increment the version number
    const existingDoc = await this.getExistingSummary(callSid);
    const summaryVersion = existingDoc
      ? (existingDoc.summaryVersion || 0) + 1
      : 1;

    const updatedMetadata = {
      ...metadata,
      summaryVersion,
      lastUpdated: new Date().toISOString(),
    };

    return this.storeSummary(callSid, summary, updatedMetadata);
  }

  private async getExistingSummary(callSid: string): Promise<any> {
    try {
      const query = await this.index.query({
        id: `summary_${callSid}`,
        topK: 1,
        includeMetadata: true,
      });
      return query.matches?.[0]?.metadata || null;
    } catch (error) {
      this.log.warn(
        "get-existing-summary",
        `Could not fetch existing summary for ${callSid}: ${error}`
      );
      return null;
    }
  }

  /****************************************************
   Transcript Storage
  ****************************************************/
  async storeTranscript(
    callSid: string,
    turns: TurnRecord[],
    metadata: ConversationMetadata
  ): Promise<StorageResult> {
    const startTime = Date.now();

    try {
      // Format transcript content
      const transcriptContent = formatTranscriptForEmbedding(turns);
      if (!transcriptContent.trim()) {
        this.log.warn(
          "empty-transcript",
          `No meaningful content found for transcript ${callSid}`
        );
        return {
          success: true,
          documentIds: [],
          error: "No meaningful transcript content",
        };
      }

      // Chunk the transcript if it's too long
      const chunks = chunkText(transcriptContent, {
        maxTokens: 7000, // Leave room for metadata in context
        preserveSentences: true,
      });

      const documentIds: string[] = [];
      const embeddingStart = Date.now();
      let totalEmbeddingTime = 0;
      let totalStorageTime = 0;

      // Process each chunk
      for (const chunk of chunks) {
        const chunkEmbeddingStart = Date.now();
        const embeddingResponse = await generateEmbedding({
          content: chunk.content,
        });
        totalEmbeddingTime += Date.now() - chunkEmbeddingStart;

        const documentId = `transcript_${callSid}_${chunk.index}`;

        // Truncate content if too long for Pinecone metadata (40KB limit)
        const maxContentLength = 30000; // Leave room for other metadata
        const truncatedContent =
          chunk.content.length > maxContentLength
            ? chunk.content.substring(0, maxContentLength) +
              "... [content truncated]"
            : chunk.content;

        const vectorMetadata = {
          ...metadata,
          contentType: "transcript" as const,
          recordType: "conversation_segment" as const,
          segmentIndex: chunk.index,
          totalSegments: chunk.totalChunks,
          turnCount: turns.length,
          lastUpdated: Date.now(), // Store as Unix timestamp for range queries
          // Store the actual formatted content for retrieval
          originalContent: truncatedContent,
          // Keep ISO string for human readability
          callStartTimeISO: metadata.callStartTime,
          // Convert to Unix timestamp for filtering
          callStartTime: new Date(metadata.callStartTime).getTime(),
        };

        const storageStart = Date.now();
        await this.index.upsert([
          {
            id: documentId,
            values: embeddingResponse.embedding,
            metadata: vectorMetadata,
          },
        ]);
        totalStorageTime += Date.now() - storageStart;

        documentIds.push(documentId);
      }

      const totalTime = Date.now() - startTime;
      this.log.info(
        "transcript-stored",
        `Stored transcript for ${callSid} in ${chunks.length} chunks in ${totalTime}ms (embed: ${totalEmbeddingTime}ms, store: ${totalStorageTime}ms)`
      );

      return {
        success: true,
        documentIds,
        metrics: {
          processingTime: totalTime,
          embeddingTime: totalEmbeddingTime,
          storageTime: totalStorageTime,
        },
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log.error(
        "transcript-storage-error",
        `Failed to store transcript for ${callSid} after ${totalTime}ms: ${errorMessage}`
      );

      return {
        success: false,
        documentIds: [],
        error: errorMessage,
        metrics: {
          processingTime: totalTime,
          embeddingTime: 0,
          storageTime: 0,
        },
      };
    }
  }

  /****************************************************
   Context Retrieval
  ****************************************************/
  async getRelevantContext(
    participantPhone: string,
    currentQuery?: string,
    options: ContextRetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const {
      topK = 10,
      includeMetadata = true,
      maxDays = 30,
      contentTypes = ["summary", "transcript"],
      minScore = 0.3,
    } = options;

    const startTime = Date.now();

    try {
      // Create base filter for user
      const baseFilter: any = {
        participantPhone: { $eq: participantPhone },
      };

      // Add time filter
      if (maxDays > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxDays);
        // Use Unix timestamp for comparison (Pinecone requires numbers for $gte)
        baseFilter.callStartTime = { $gte: cutoffDate.getTime() };

        this.log.debug(
          "time-filter",
          `Time filter: callStartTime >= ${cutoffDate.getTime()} (${cutoffDate.toISOString()})`
        );
      }

      // Add content type filter
      if (contentTypes.length < 2) {
        baseFilter.contentType = { $eq: contentTypes[0] };
      }

      this.log.debug(
        "query-filter",
        `Query filter: ${JSON.stringify(baseFilter)}`
      );
      this.log.debug(
        "query-params",
        `topK: ${topK}, minScore: ${minScore}, participantPhone: ${participantPhone}`
      );

      let queryVector: number[];
      if (currentQuery) {
        const embeddingResponse = await generateEmbedding({
          content: currentQuery,
        });
        queryVector = embeddingResponse.embedding;
      } else {
        // Default query for recent interactions
        const embeddingResponse = await generateEmbedding({
          content: "Recent customer interactions and conversation history",
        });
        queryVector = embeddingResponse.embedding;
      }

      // Query Pinecone
      const queryResult = await this.index.query({
        vector: queryVector,
        topK,
        filter: baseFilter,
        includeMetadata,
      });

      this.log.debug(
        "pinecone-raw-results",
        `Raw results: ${
          queryResult.matches.length
        } matches, scores: ${queryResult.matches
          .map((m: any) => m.score)
          .join(", ")}`
      );

      // Process matches BEFORE filtering by minScore to see what we're getting
      const allMatches = queryResult.matches.map((match: any) => ({
        id: match.id,
        content: this.extractContentFromMetadata(match.metadata),
        score: match.score,
        metadata: match.metadata,
      }));

      this.log.debug(
        "all-matches",
        `All matches: ${allMatches.map((m) => `${m.id}:${m.score}`).join(", ")}`
      );

      // Filter by minScore
      const matches: ConversationMatch[] = allMatches.filter(
        (match) => match.score >= minScore
      );

      this.log.debug(
        "filtered-matches",
        `After minScore filter (${minScore}): ${matches.length} matches`
      );

      const queryTime = Date.now() - startTime;
      this.log.debug(
        "context-retrieved",
        `Retrieved ${matches.length} matches for ${participantPhone} in ${queryTime}ms`
      );

      return {
        success: true,
        matches,
        totalFound: matches.length,
        metrics: {
          queryTime,
          processingTime: queryTime,
        },
      };
    } catch (error) {
      const queryTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log.error(
        "context-retrieval-error",
        `Failed to retrieve context for ${participantPhone} after ${queryTime}ms: ${errorMessage}`
      );

      return {
        success: false,
        matches: [],
        totalFound: 0,
        error: errorMessage,
        metrics: {
          queryTime,
          processingTime: queryTime,
        },
      };
    }
  }

  /****************************************************
   Data Management
  ****************************************************/
  async cleanupOldRecords(
    retentionDays: number
  ): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      // Note: Pinecone doesn't support bulk delete by metadata filter in all tiers
      // This is a simplified implementation - production might need batch processing
      this.log.info(
        "cleanup-started",
        `Starting cleanup of records older than ${retentionDays} days (before ${cutoffDate.toISOString()})`
      );

      // For now, log the intent - actual implementation depends on Pinecone tier
      this.log.warn(
        "cleanup-not-implemented",
        "Bulk cleanup by date not yet implemented - consider upgrading Pinecone tier for this feature"
      );

      return { deletedCount: 0 };
    } catch (error) {
      this.log.error("cleanup-error", `Cleanup failed: ${error}`);
      throw error;
    }
  }

  /****************************************************
   Utility Methods
  ****************************************************/
  private extractContentFromMetadata(metadata: any): string {
    // Return the actual stored content if available
    if (metadata.originalContent) {
      return metadata.originalContent;
    }

    // Fallback to placeholder if originalContent is missing (for backward compatibility)
    if (metadata.contentType === "summary") {
      return `Summary from ${metadata.callStartTime}: ${
        metadata.topics?.join(", ") || "No topics"
      }`;
    } else {
      return `Transcript segment ${metadata.segmentIndex + 1}/${
        metadata.totalSegments
      } from ${metadata.callStartTime}`;
    }
  }

  /****************************************************
   Error Handling with Retry Logic
  ****************************************************/
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.maxRetries) {
          this.log.error(
            "max-retries-exceeded",
            `${context} failed after ${attempt} attempts: ${lastError.message}`
          );
          throw lastError;
        }

        this.log.warn(
          "retry-attempt",
          `${context} failed on attempt ${attempt}, retrying in ${this.config.retryDelay}ms: ${lastError.message}`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryDelay! * attempt)
        );
      }
    }

    throw lastError!;
  }
}
