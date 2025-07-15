import type { 
  MemorySchema, 
  GlobalMemorySchema
} from "../../shared/memory/types.js";
import { DEMO_SCHEMAS } from "../../shared/memory/demo-schemas.js";
import { getMakeLogger } from "../../lib/logger.js";

export interface SyncClient {
  map(uniqueName: string): Promise<SyncMap>;
}

export interface SyncMapItem {
  key: string;
  data: any;
}

export interface MapItemAddedEvent {
  item: SyncMapItem;
  isLocal: boolean;
}

export interface MapItemUpdatedEvent {
  item: SyncMapItem;
  isLocal: boolean;
}

export interface MapItemRemovedEvent {
  key: string;
  isLocal: boolean;
}

export interface SyncMap {
  set(key: string, data: Record<string, unknown>): Promise<SyncMapItem>;
  remove(key: string): Promise<boolean>;
  on(event: 'itemAdded', listener: (ev: MapItemAddedEvent) => void): void;
  on(event: 'itemUpdated', listener: (ev: MapItemUpdatedEvent) => void): void;
  on(event: 'itemRemoved', listener: (ev: MapItemRemovedEvent) => void): void;
}

export class SchemaManager {
  private log: ReturnType<typeof getMakeLogger>;
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes
  private cache: { schemas: Record<string, MemorySchema>; timestamp: number } | null = null;
  private readonly SCHEMA_INDEX_KEY = '_schema_index';
  private syncMapPromise: Promise<SyncMap> | null = null;
  private currentSchemas: Record<string, GlobalMemorySchema> = {};

  constructor(
    private syncClient: SyncClient,
    callSid?: string
  ) {
    this.log = getMakeLogger(callSid || 'schema-manager');
    this.initializeSyncMap();
  }

  private async initializeSyncMap() {
    try {
      this.syncMapPromise = this.syncClient.map('memory_schemas');
      const syncMap = await this.syncMapPromise;
      
      // Load existing schemas first
      await this.loadExistingSchemas(syncMap);
      
      // Set up event listeners for future changes
      syncMap.on('itemAdded', (ev) => {
        if (ev.isLocal) return;
        const schema = ev.item.data as GlobalMemorySchema;
        if (schema && ev.item.key !== this.SCHEMA_INDEX_KEY) {
          this.currentSchemas[ev.item.key] = schema;
          this.cache = null; // Invalidate cache
          this.log.info("schema-manager", `Schema added: ${ev.item.key} (active: ${schema.isActive})`);
        }
      });

      syncMap.on('itemUpdated', (ev) => {
        if (ev.isLocal) return;
        const schema = ev.item.data as GlobalMemorySchema;
        if (schema && ev.item.key !== this.SCHEMA_INDEX_KEY) {
          this.currentSchemas[ev.item.key] = schema;
          this.cache = null; // Invalidate cache
          this.log.info("schema-manager", `Schema updated: ${ev.item.key} (active: ${schema.isActive})`);
        }
      });

      syncMap.on('itemRemoved', (ev) => {
        if (ev.isLocal) return;
        if (ev.key !== this.SCHEMA_INDEX_KEY) {
          delete this.currentSchemas[ev.key];
          this.cache = null; // Invalidate cache
          this.log.info("schema-manager", `Schema removed: ${ev.key}`);
        }
      });

      this.log.debug("schema-manager", "Schema sync map initialized with event listeners");
    } catch (error) {
      this.log.error("schema-manager", `Failed to initialize sync map: ${error}`);
    }
  }

  private async loadExistingSchemas(syncMap: SyncMap) {
    try {
      // Use Twilio REST API to fetch existing items since backend sync client
      // doesn't have getItems() method
      const twilio = (await import("twilio")).default;
      const { TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_ACCOUNT_SID, TWILIO_SYNC_SVC_SID } = await import("../../shared/env.js");
      
      const client = twilio(TWILIO_API_KEY, TWILIO_API_SECRET, { accountSid: TWILIO_ACCOUNT_SID });
      
      try {
        const syncMapItems = await client.sync.v1
          .services(TWILIO_SYNC_SVC_SID)
          .syncMaps('memory_schemas')
          .syncMapItems
          .list();
        
        let loadedCount = 0;
        for (const item of syncMapItems) {
          if (item.key !== this.SCHEMA_INDEX_KEY) {
            const schema = item.data as GlobalMemorySchema;
            if (schema) {
              this.currentSchemas[item.key] = schema;
              loadedCount++;
            }
          }
        }
        
        if (loadedCount > 0) {
          this.log.info("schema-manager", `Loaded ${loadedCount} existing schemas from REST API: [${Object.keys(this.currentSchemas).join(', ')}]`);
        } else {
          this.log.info("schema-manager", "No existing schemas found via REST API");
        }
      } catch (restError: any) {
        if (restError.code === 20404) {
          this.log.info("schema-manager", "Memory schemas sync map doesn't exist yet - no existing schemas to load");
        } else {
          this.log.warn("schema-manager", `Failed to fetch existing schemas via REST API: ${restError.message || restError}`);
        }
      }
    } catch (error) {
      this.log.warn("schema-manager", `Failed to load existing schemas: ${error}`);
    }
  }

  /**
   * Get all active memory schemas from Sync, with fallback to demo schemas
   */
  async getActiveSchemas(): Promise<Record<string, MemorySchema>> {
    try {
      // Check cache first
      if (this.cache && Date.now() - this.cache.timestamp < this.cacheExpiry) {
        this.log.debug("schema-manager", "Returning cached schemas");
        return this.cache.schemas;
      }

      // Get active schemas from current state (populated by sync events)
      const activeSchemas: Record<string, MemorySchema> = {};
      
      for (const [schemaId, schema] of Object.entries(this.currentSchemas)) {
        if (schema.isActive) {
          activeSchemas[schemaId] = schema;
        }
      }
      
      // If we have custom schemas, use them
      if (Object.keys(activeSchemas).length > 0) {
        // Update cache
        this.cache = {
          schemas: activeSchemas,
          timestamp: Date.now()
        };
        
        this.log.info("schema-manager", `Using ${Object.keys(activeSchemas).length} active custom schemas: [${Object.keys(activeSchemas).join(', ')}]`);
        return activeSchemas;
      }
      
      // Fallback to demo schemas if no custom schemas
      this.log.debug("schema-manager", "No custom schemas found, using demo schemas");
      
      // Update cache with demo schemas
      this.cache = {
        schemas: DEMO_SCHEMAS,
        timestamp: Date.now()
      };
      
      return DEMO_SCHEMAS;
    } catch (error) {
      this.log.warn("schema-manager", `Failed to load schemas from Sync: ${error}`);
    }
    
    // Fallback to demo schemas
    this.log.debug("schema-manager", "Falling back to demo schemas");
    return DEMO_SCHEMAS;
  }

  /**
   * List all schemas (active and inactive)
   */
  async listAllSchemas(): Promise<Record<string, GlobalMemorySchema>> {
    // Return current schemas from sync events
    if (Object.keys(this.currentSchemas).length > 0) {
      this.log.debug("schema-manager", `Returning ${Object.keys(this.currentSchemas).length} schemas from sync`);
      return { ...this.currentSchemas };
    }
    
    // Fallback to demo schemas converted to GlobalMemorySchema format
    const globalSchemas: Record<string, GlobalMemorySchema> = {};
    const now = new Date().toISOString();
    
    Object.entries(DEMO_SCHEMAS).forEach(([id, schema]) => {
      globalSchemas[id] = {
        ...schema,
        createdAt: now,
        updatedAt: now,
        isActive: true,
        version: 1
      };
    });
    
    this.log.debug("schema-manager", "Returning demo schemas as no custom schemas available");
    return globalSchemas;
  }

  /**
   * Save a schema (create or update)
   */
  async saveSchema(schema: MemorySchema): Promise<void> {
    // For now, just log that the operation was requested
    // The UI will handle schema persistence, and backend will use demo schemas
    this.log.info("schema-manager", `Schema save requested for ${schema.id} (backend sync not yet implemented)`);
    
    // Clear cache so it gets refreshed
    this.cache = null;
  }

  /**
   * Delete a schema
   */
  async deleteSchema(schemaId: string): Promise<void> {
    this.log.info("schema-manager", `Schema delete requested for ${schemaId} (backend sync not yet implemented)`);
    this.cache = null;
  }

  /**
   * Activate or deactivate a schema
   */
  async setSchemaActive(schemaId: string, isActive: boolean): Promise<void> {
    this.log.info("schema-manager", `Schema ${isActive ? 'activation' : 'deactivation'} requested for ${schemaId} (backend sync not yet implemented)`);
    this.cache = null;
  }


  /**
   * Validate a schema structure
   */
  validateSchema(schema: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema.id || typeof schema.id !== 'string') {
      errors.push('Schema must have a valid string id');
    }

    if (!schema.name || typeof schema.name !== 'string') {
      errors.push('Schema must have a valid string name');
    }

    if (!schema.description || typeof schema.description !== 'string') {
      errors.push('Schema must have a valid string description');
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      errors.push('Schema must have a properties object');
    } else {
      const propertyCount = Object.keys(schema.properties).length;
      if (propertyCount === 0) {
        errors.push('Schema must have at least one property');
      } else if (propertyCount > 50) {
        errors.push('Schema cannot have more than 50 properties');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Initialize schemas with demo schemas if none exist
   */
  async initializeWithDemoSchemas(): Promise<void> {
    try {
      const existingSchemas = await this.listAllSchemas();
      
      if (Object.keys(existingSchemas).length === 0) {
        this.log.info("schema-manager", "No schemas found, initializing with demo schemas");
        
        for (const [schemaId, schema] of Object.entries(DEMO_SCHEMAS)) {
          await this.saveSchema(schema);
        }
        
        this.log.info("schema-manager", `Initialized with ${Object.keys(DEMO_SCHEMAS).length} demo schemas`);
      }
    } catch (error) {
      this.log.error("schema-manager", `Failed to initialize demo schemas: ${error}`);
    }
  }

  /**
   * Clear the cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache = null;
    this.log.debug("schema-manager", "Cache cleared");
  }

  /**
   * Get current schema count for debugging
   */
  getSchemaCount(): number {
    return Object.keys(this.currentSchemas).length;
  }

  /**
   * Get schema IDs for debugging
   */
  getSchemaIds(): string[] {
    return Object.keys(this.currentSchemas);
  }
}

/**
 * Helper function to check if an error is a sync map item not found error
 */
function isSyncMapItemNotFound(error: any): boolean {
  return (
    typeof error === "object" &&
    "status" in error &&
    "code" in error &&
    error.status === 404 &&
    error.code === 54201
  );
}