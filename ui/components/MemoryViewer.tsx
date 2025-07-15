import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconBrain, IconClock, IconTarget } from "@tabler/icons-react";
import type { UserMemories, GlobalMemorySchema } from "../shared/memory/types";
import { DEMO_SCHEMAS } from "../shared/memory/demo-schemas";
import { useSyncClient } from "../state/sync";
import { useState, useEffect } from "react";

interface MemoryViewerProps {
  memories: UserMemories;
}

export function MemoryViewer({ memories }: MemoryViewerProps) {
  const [schemas, setSchemas] = useState<Record<string, GlobalMemorySchema>>({});
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const syncClient = useSyncClient();
  
  // Load schemas from sync
  useEffect(() => {
    const loadSchemas = async () => {
      if (!syncClient) return;
      
      try {
        const map = await syncClient.map("memory_schemas");
        const result = await map.getItems();
        
        const schemasData: Record<string, GlobalMemorySchema> = {};
        for (const item of result.items) {
          schemasData[item.key] = item.data as GlobalMemorySchema;
        }
        
        setSchemas(schemasData);
        setSchemasLoaded(true);
      } catch (err) {
        console.error("Failed to load schemas for MemoryViewer:", err);
        // Fallback to demo schemas
        const demoSchemasAsGlobal: Record<string, GlobalMemorySchema> = {};
        Object.entries(DEMO_SCHEMAS).forEach(([id, schema]) => {
          demoSchemasAsGlobal[id] = {
            ...schema,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            version: 1
          };
        });
        setSchemas(demoSchemasAsGlobal);
        setSchemasLoaded(true);
      }
    };
    
    loadSchemas();
  }, [syncClient]);

  const memoryEntries = Object.entries(memories || {});

  if (memoryEntries.length === 0) {
    return (
      <Card withBorder>
        <Group>
          <IconBrain size={20} />
          <Text size="sm" c="dimmed">
            No memories extracted yet
          </Text>
        </Group>
      </Card>
    );
  }

  if (!schemasLoaded) {
    return (
      <Card withBorder>
        <Group>
          <IconBrain size={20} />
          <Text size="sm" c="dimmed">
            Loading memory schemas...
          </Text>
        </Group>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Group>
        <IconBrain size={20} />
        <Title order={4}>Extracted Memories</Title>
      </Group>
      
      {memoryEntries.map(([schemaId, memoryRecord]) => {
        // Try custom schemas first, then fall back to demo schemas
        const schema = schemas[schemaId] || DEMO_SCHEMAS[schemaId];
        if (!schema) {
          console.warn(`Schema not found for memory: ${schemaId}`);
          return null;
        }

        return (
          <Card key={schemaId} withBorder padding="sm">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={500} size="sm">
                  {schema.name}
                </Text>
                <Badge
                  color={getConfidenceColor(memoryRecord.confidence)}
                  size="sm"
                  variant="light"
                >
                  {Math.round(memoryRecord.confidence * 100)}% confidence
                </Badge>
              </Group>
              
              <Text size="xs" c="dimmed">
                {schema.description}
              </Text>
              
              <Stack gap="xs">
                {Object.entries(memoryRecord.data).map(([key, value]) => (
                  <Group key={key} justify="space-between">
                    <Text size="sm" c="dimmed">
                      {formatPropertyName(key)}:
                    </Text>
                    <Text size="sm" fw={500}>
                      {formatValue(value)}
                    </Text>
                  </Group>
                ))}
              </Stack>
              
              <Group gap="md" mt="xs">
                <Group gap="xs">
                  <IconClock size={14} />
                  <Text size="xs" c="dimmed">
                    {formatDate(memoryRecord.lastUpdated)}
                  </Text>
                </Group>
                <Group gap="xs">
                  <IconTarget size={14} />
                  <Text size="xs" c="dimmed">
                    {memoryRecord.sources && memoryRecord.sources.length > 1 
                      ? `From ${memoryRecord.sources.length} calls`
                      : `From call ${memoryRecord.source?.slice(-6)}`
                    }
                  </Text>
                </Group>
              </Group>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "green";
  if (confidence >= 0.6) return "yellow";
  return "red";
}

function formatPropertyName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatValue(value: any): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch {
    return dateString;
  }
}