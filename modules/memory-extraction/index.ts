import { readFileSync } from "fs";
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/index.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { AgentResolver } from "../../completion-server/agent-resolver/index.js";
import type { SessionStore } from "../../completion-server/session-store/index.js";
import { getMakeLogger } from "../../lib/logger.js";
import { interpolateTemplate } from "../../lib/template.js";
import { OPENAI_API_KEY } from "../../shared/env.js";
import type { MemoryRecord, UserMemories, MemorySchema } from "../../shared/memory/types.js";
import { SegmentTrackingClient } from "../../lib/tracking.js";
import { SEGMENT_TRACKING_WRITE_KEY } from "../../shared/env.js";
import { SchemaManager } from "../../services/memory-store/schema-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const trackingClient = new SegmentTrackingClient(SEGMENT_TRACKING_WRITE_KEY);

const instructionsTemplate = readFileSync(
  join(__dirname, "instructions.md"),
  "utf-8"
);

interface MemoryExtractionServiceConfig {
  frequency: number;
}

export class MemoryExtractionService {
  log: ReturnType<typeof getMakeLogger>;
  private schemaManager: SchemaManager;

  constructor(
    private store: SessionStore,
    private agent: AgentResolver,
    private config: MemoryExtractionServiceConfig
  ) {
    this.log = getMakeLogger(store.callSid);
    this.schemaManager = new SchemaManager(
      (store as any).syncClient, // Access syncClient from SessionStore
      store.callSid
    );
  }

  private timeout: NodeJS.Timeout | undefined;
  
  start = async () => {
    if (this.timeout) throw Error("The Memory Extraction loop is already started.");
    
    // Initialize schemas if needed
    try {
      await this.schemaManager.initializeWithDemoSchemas();
    } catch (error) {
      this.log.warn("memory-extraction", `Failed to initialize schemas: ${error}`);
    }
    
    this.timeout = setInterval(this.execute, this.config.frequency);
  };

  stop = () => clearInterval(this.timeout);

  private async getActiveSchemas(): Promise<Record<string, MemorySchema>> {
    return await this.schemaManager.getActiveSchemas();
  }

  execute = async () => {
    const transcript = this.getTranscript();
    if (!transcript || transcript.length < 50) {
      // Skip if transcript is too short
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      this.log.warn("memory-extraction", "No user ID found, skipping memory extraction");
      return;
    }

    // Get active schemas dynamically
    const activeSchemas = await this.getActiveSchemas();
    
    // Get current memories from user context
    const currentMemories = this.getCurrentMemories(activeSchemas);
    
    const instructions = interpolateTemplate(instructionsTemplate, {
      transcript,
      schemas: JSON.stringify(activeSchemas, null, 2),
      currentMemories: JSON.stringify(currentMemories, null, 2),
      userId
    });

    let completion: ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: instructions }],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_memory",
              description: "Extract or update memory information for a user. MUST include memory_data with the actual extracted information.",
              parameters: {
                type: "object",
                properties: {
                  schema_id: {
                    type: "string",
                    enum: Object.keys(activeSchemas),
                    description: "The ID of the memory schema"
                  },
                  memory_data: {
                    type: "object",
                    description: "The extracted memory data as a JSON object matching the schema properties. REQUIRED. Example: {\"diet_type\": \"vegetarian\", \"allergies\": [\"nuts\"]}"
                  },
                  confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 1,
                    description: "Confidence score for the extraction (0-1)"
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why this memory was extracted"
                  }
                },
                required: ["schema_id", "memory_data", "confidence", "reasoning"]
              }
            }
          }
        ],
        tool_choice: "auto",
        stream: false,
      });
    } catch (error) {
      this.log.error(
        "memory-extraction",
        "Memory extraction completion request failed",
        error
      );
      return;
    }

    const choice = completion.choices[0];
    
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      await this.handleToolCalls(choice.message.tool_calls, userId);
    } else if (choice.finish_reason === "stop") {
      // No memories to extract
      this.log.debug("memory-extraction", "No memories extracted from current conversation");
    }
  };

  private async handleToolCalls(toolCalls: any[], userId: string) {
    this.log.debug("memory-extraction", `Received ${toolCalls.length} tool calls`);
    
    for (const toolCall of toolCalls) {
      this.log.debug("memory-extraction", `Processing tool call: ${toolCall.function.name}`);
      
      if (toolCall.function.name === "extract_memory") {
        try {
          this.log.debug("memory-extraction", `Raw tool arguments: ${toolCall.function.arguments}`);
          const args = JSON.parse(toolCall.function.arguments);
          await this.extractMemory(args, userId);
        } catch (error) {
          this.log.error(
            "memory-extraction",
            `Error processing tool call: ${error}`
          );
        }
      }
    }
  }

  private async extractMemory(args: any, userId: string) {
    this.log.debug("memory-extraction", `Tool call args: ${JSON.stringify(args)}`);
    
    const { schema_id, memory_data, confidence, reasoning } = args;
    
    // Get active schemas to validate schema_id
    const activeSchemas = await this.getActiveSchemas();
    if (!activeSchemas[schema_id]) {
      this.log.warn("memory-extraction", `Unknown schema ID: ${schema_id}`);
      return;
    }

    if (!memory_data || typeof memory_data !== 'object') {
      this.log.warn("memory-extraction", `Invalid or missing memory_data for ${schema_id}: ${JSON.stringify(memory_data)}`);
      return;
    }

    // Validate confidence score
    if (confidence < 0.6) {
      this.log.debug(
        "memory-extraction",
        `Low confidence (${confidence}) for ${schema_id}, skipping extraction`
      );
      return;
    }

    const currentMemories = this.getCurrentMemories(activeSchemas);
    const existingMemory = currentMemories[schema_id];
    
    // Always merge data, but check if we have meaningful new information
    if (existingMemory && this.shouldSkipExtraction(existingMemory, memory_data, confidence)) {
      this.log.debug(
        "memory-extraction",
        `No meaningful new information to merge for ${schema_id}`
      );
      return;
    }

    // Merge with existing memory data
    const existingData = existingMemory?.data || {};
    const mergedData = this.mergeMemoryData(existingData, memory_data);
    
    this.log.debug("memory-extraction", `Merging data for ${schema_id}:`);
    this.log.debug("memory-extraction", `  Existing: ${JSON.stringify(existingData)}`);
    this.log.debug("memory-extraction", `  New: ${JSON.stringify(memory_data)}`);
    this.log.debug("memory-extraction", `  Merged: ${JSON.stringify(mergedData)}`);
    
    // Calculate confidence for merged data
    const mergedConfidence = this.calculateMergedConfidence(existingMemory, confidence);
    this.log.debug("memory-extraction", `Confidence: ${existingMemory?.confidence || 'none'} → ${confidence} → ${mergedConfidence}`);
    
    // Track sources that contributed to this memory
    const existingSources = existingMemory?.sources || [];
    const updatedSources = this.updateSources(existingSources, this.store.callSid);

    // Create updated memory record
    const memoryRecord: MemoryRecord = {
      data: mergedData,
      confidence: mergedConfidence,
      lastUpdated: new Date().toISOString(),
      source: this.store.callSid,
      sources: updatedSources
    };

    this.log.debug("memory-extraction", `Created memory record: ${JSON.stringify(memoryRecord)}`);

    // Update memories in Segment - store at top level
    const updatedTraits = {
      ...this.store.context.user?.traits,
      [schema_id]: memoryRecord
    };

    this.log.debug("memory-extraction", `Updated traits: ${JSON.stringify(updatedTraits)}`);

    try {
      const identifyParams = {
        user_id: userId,
        traits: updatedTraits
      };
      
      this.log.debug("memory-extraction", `Calling trackingClient.identify with: ${JSON.stringify(identifyParams)}`);
      
      await trackingClient.identify({
        userId: identifyParams.user_id,
        traits: identifyParams.traits
      });
      
      this.log.debug("memory-extraction", `Successfully updated user traits in Segment`);

      this.log.info(
        "memory-extracted",
        `Extracted memory for ${schema_id} with confidence ${confidence}: ${reasoning}`
      );

      // Update local context for immediate use
      const currentUser = this.store.context.user;
      if (currentUser) {
        this.store.setContext({
          user: {
            ...currentUser,
            traits: updatedTraits
          }
        });
      }

    } catch (error) {
      this.log.error(
        "memory-extraction",
        `Failed to store memory for ${schema_id}: ${error}`
      );
    }
  }

  private getCurrentMemories(activeSchemas: Record<string, MemorySchema>): UserMemories {
    const user = this.store.context.user;
    const traits = user?.traits || {};
    const memories: UserMemories = {};
    
    this.log.debug("memory-extraction", `Current user traits: ${JSON.stringify(traits)}`);
    
    // Extract memory records from top-level traits
    for (const schemaId of Object.keys(activeSchemas)) {
      this.log.debug("memory-extraction", `Checking for schema ${schemaId} in traits`);
      const trait = traits[schemaId];
      if (trait && typeof trait === 'object' && 'data' in trait) {
        memories[schemaId] = trait as MemoryRecord;
        this.log.debug("memory-extraction", `Found memory for ${schemaId}: ${JSON.stringify(trait)}`);
      } else if (trait) {
        this.log.debug("memory-extraction", `Found trait ${schemaId} but it doesn't look like a memory: ${JSON.stringify(trait)}`);
      }
    }
    
    this.log.debug("memory-extraction", `Extracted memories: ${JSON.stringify(memories)}`);
    return memories;
  }

  private getUserId(): string | undefined {
    return this.store.context.user?.user_id;
  }

  private mergeMemoryData(existingData: Record<string, any>, newData: Record<string, any>): Record<string, any> {
    // Simple merge - new data overwrites old for same keys
    // This preserves existing fields while updating/adding new ones
    return { ...existingData, ...newData };
  }

  private calculateMergedConfidence(existingMemory: MemoryRecord | undefined, newConfidence: number): number {
    if (!existingMemory) {
      return newConfidence;
    }
    
    // Use the higher confidence score between existing and new
    // Alternative: Could use weighted average based on recency
    return Math.max(existingMemory.confidence, newConfidence);
  }

  private updateSources(existingSources: string[], newSource: string): string[] {
    // Add new source if not already present
    if (!existingSources.includes(newSource)) {
      return [...existingSources, newSource];
    }
    return existingSources;
  }

  private shouldSkipExtraction(existingMemory: MemoryRecord, newData: Record<string, any>, newConfidence: number): boolean {
    const existingData = existingMemory.data || {};
    
    // Always extract if this is significantly more confident
    if (newConfidence > existingMemory.confidence + 0.2) {
      return false;
    }
    
    // Check if new data contains any new fields
    const newFields = Object.keys(newData).filter(key => !(key in existingData));
    if (newFields.length > 0) {
      this.log.debug("memory-extraction", `Found new fields: ${newFields.join(', ')}`);
      return false; // Don't skip - we have new information
    }
    
    // Check if any existing fields have different values
    const hasChanges = Object.entries(newData).some(([key, value]) => {
      const existingValue = existingData[key];
      // For arrays, do a simple comparison
      if (Array.isArray(value) && Array.isArray(existingValue)) {
        return JSON.stringify(value.sort()) !== JSON.stringify(existingValue.sort());
      }
      return existingValue !== value;
    });
    
    if (hasChanges && newConfidence < existingMemory.confidence - 0.2) {
      this.log.debug("memory-extraction", `New data has changes but much lower confidence (${newConfidence} vs ${existingMemory.confidence})`);
      return true; // Skip - changes but low confidence
    }
    
    if (!hasChanges && newConfidence <= existingMemory.confidence) {
      this.log.debug("memory-extraction", `No new information and similar/lower confidence`);
      return true; // Skip - no new information
    }
    
    return false; // Don't skip - there are meaningful updates
  }

  private getTranscript = () =>
    this.store.turns
      .list()
      .map((turn) => {
        if (turn.role === "bot") {
          if (turn.origin === "filler") return;
          if (turn.type === "tool") return;
          return `[${turn.role.toUpperCase()}]: ${turn.content}`;
        }

        if (turn.role === "human") {
          return `[${turn.role.toUpperCase()}]: ${turn.content}`;
        }

        if (turn.role === "system") {
          return false;
        }
      })
      .filter((line) => !!line)
      .join("\n\n");
}