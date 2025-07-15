export interface MemoryRecord {
  data: Record<string, any>; // Extracted memory data
  confidence: number; // Extraction confidence score (0-1)
  lastUpdated: string; // ISO timestamp
  source: string; // CallSid where memory was last updated
  sources?: string[]; // Array of all CallSids that contributed to this memory
}

export interface MemorySchema {
  id: string;
  name: string;
  description: string;
  properties: Record<string, any>; // JSON schema properties
}

export interface GlobalMemorySchema extends MemorySchema {
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  version: number;
}

export interface MemorySchemaDocument {
  schemas: Record<string, GlobalMemorySchema>;
  lastUpdated: string;
}

export interface MemoryExtractionResult {
  schemaId: string;
  extractedData: Record<string, any>;
  confidence: number;
  shouldUpdate: boolean;
}

export interface UserMemories {
  [schemaId: string]: MemoryRecord;
}

// Type for the memories stored in Segment traits (stored as top-level traits)
export interface SegmentMemoryTraits {
  // Memory records are stored as top-level traits, keyed by schema ID
  [schemaId: string]: MemoryRecord | any; // any for other non-memory traits
}