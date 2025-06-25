import type { TurnRecord } from "../../shared/session/turns.js";
import type { CallSummary } from "../../modules/summarization/types.js";

/****************************************************
 Vector Store Configuration
****************************************************/
export interface VectorStoreConfig {
  apiKey: string;
  indexName: string;
  embeddingModel?: string;
  maxRetries?: number;
  retryDelay?: number;
}

/****************************************************
 Metadata Schema
****************************************************/
export interface VectorMetadata {
  // Core identifiers
  callSid: string;
  participantPhone: string; // E164 format
  userId?: string; // if available from user database

  // Temporal data
  callStartTime: string | number; // ISO 8601 string or Unix timestamp
  callStartTimeISO?: string; // Human-readable ISO 8601 format
  callEndTime?: string | number; // ISO 8601 string or Unix timestamp
  lastUpdated: string | number; // ISO 8601 string or Unix timestamp

  // Content classification
  contentType: "summary" | "transcript";
  recordType: "call_summary" | "conversation_segment" | "full_transcript";

  // Conversation context
  topics: string[]; // from existing topic extraction
  callDirection: "inbound" | "outbound";
  callStatus: string; // Twilio call status

  // Content metrics
  turnCount?: number;
  durationSeconds?: number;

  // User context
  userCity?: string;
  userState?: string;
  hasOrderHistory?: boolean;

  // Segmentation (for transcripts)
  segmentIndex?: number;
  totalSegments?: number;
  summaryVersion?: number; // for summaries
  
  // Actual conversation content for retrieval
  originalContent?: string;
}

/****************************************************
 Document Types
****************************************************/
export interface SummaryDocument {
  id: string; // `summary_${callSid}`
  content: string; // Formatted summary content for embedding generation
  embedding: number[]; // OpenAI text-embedding-3-large
  metadata: VectorMetadata & {
    contentType: "summary";
    recordType: "call_summary";
    summaryVersion: number;
    originalContent: string; // Actual content stored for retrieval
  };
}

export interface TranscriptDocument {
  id: string; // `transcript_${callSid}_${segmentIndex}`
  content: string; // Formatted conversation turns for embedding generation
  embedding: number[];
  metadata: VectorMetadata & {
    contentType: "transcript";
    recordType: "conversation_segment";
    segmentIndex: number;
    totalSegments: number;
    originalContent: string; // Actual content stored for retrieval
  };
}

export type VectorDocument = SummaryDocument | TranscriptDocument;

/****************************************************
 Context Types
****************************************************/
export interface ConversationMatch {
  id: string;
  content: string;
  score: number;
  metadata: VectorMetadata;
}

export interface UserHistoryContext {
  recentSummaries: ConversationMatch[];
  totalConversations: number;
  lastCallDate?: string;
  commonTopics: string[];
}

export interface TopicContext {
  relevantConversations: ConversationMatch[];
  topic: string;
  relatedTopics: string[];
}

export interface DetailedContext {
  transcriptSegments: ConversationMatch[];
  summaries: ConversationMatch[];
  query: string;
  totalMatches: number;
}

export type ConversationContext =
  | UserHistoryContext
  | TopicContext
  | DetailedContext;

/****************************************************
 Conversation Metadata for Storage
****************************************************/
export interface ConversationMetadata {
  callSid: string;
  participantPhone: string;
  callStartTime: string;
  callEndTime?: string;
  callDirection: "inbound" | "outbound";
  callStatus: string;
  topics?: string[];
  turnCount?: number;
  durationSeconds?: number;
  userId?: string;
  userCity?: string;
  userState?: string;
  hasOrderHistory?: boolean;
}

/****************************************************
 Query Options
****************************************************/
export interface QueryOptions {
  topK?: number;
  includeMetadata?: boolean;
  filter?: Record<string, any>;
  namespace?: string;
}

export interface ContextRetrievalOptions extends QueryOptions {
  maxDays?: number; // filter by time range
  contentTypes?: ("summary" | "transcript")[];
  minScore?: number; // minimum similarity score
}

/****************************************************
 Embedding Types  
****************************************************/
export interface EmbeddingRequest {
  content: string;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/****************************************************
 Chunking Strategy
****************************************************/
export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  preserveSentences?: boolean;
}

export interface TextChunk {
  content: string;
  index: number;
  totalChunks: number;
  tokenCount: number;
}

/****************************************************
 Service Response Types
****************************************************/
export interface StorageResult {
  success: boolean;
  documentIds: string[];
  error?: string;
  metrics?: {
    processingTime: number;
    embeddingTime: number;
    storageTime: number;
  };
}

export interface RetrievalResult {
  success: boolean;
  matches: ConversationMatch[];
  totalFound: number;
  error?: string;
  metrics?: {
    queryTime: number;
    processingTime: number;
  };
}

/****************************************************
 Health Check Types
****************************************************/
export interface HealthStatus {
  isHealthy: boolean;
  indexStats?: {
    vectorCount: number;
    indexSize: number;
    dimension: number;
  };
  lastChecked: string;
  error?: string;
}
