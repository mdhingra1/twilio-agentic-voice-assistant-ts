import { useState, useEffect } from "react";
import { 
  Container, 
  Title, 
  Button, 
  Stack, 
  Group, 
  Modal,
  Text,
  Alert
} from "@mantine/core";
import { IconBrain, IconPlus, IconAlertCircle } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import type { 
  MemorySchema, 
  GlobalMemorySchema, 
  MemorySchemaDocument 
} from "../shared/memory/types";
import { DEMO_SCHEMAS } from "../shared/memory/demo-schemas";
import { SchemaEditor } from "../components/SchemaEditor";
import { SchemaList } from "../components/SchemaList";
import { useSyncClient } from "../state/sync";

export default function MemorySchemas() {
  const [schemas, setSchemas] = useState<Record<string, GlobalMemorySchema>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editingSchema, setEditingSchema] = useState<MemorySchema | null>(null);
  
  const syncClient = useSyncClient();

  // Load schemas from Sync
  const loadSchemas = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!syncClient) {
        throw new Error("Sync client not available");
      }

      const map = await syncClient.map("memory_schemas");
      const result = await map.getItems();
      
      const schemasData: Record<string, GlobalMemorySchema> = {};
      for (const item of result.items) {
        schemasData[item.key] = item.data as GlobalMemorySchema;
      }
      
      setSchemas(schemasData);
      
      // If no schemas exist, show demo schemas as reference
      if (Object.keys(schemasData).length === 0) {
        console.log("No custom schemas found, demo schemas are available as fallback");
      }
    } catch (err) {
      console.error("Failed to load schemas:", err);
      setError(`Failed to load schemas: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Save schema to Sync
  const saveSchema = async (schema: MemorySchema) => {
    try {
      if (!syncClient) {
        throw new Error("Sync client not available");
      }

      const map = await syncClient.map("memory_schemas");
      
      // Check if schema already exists
      let existingSchema: GlobalMemorySchema | undefined;
      try {
        const existingItem = await map.get(schema.id);
        existingSchema = existingItem?.data as GlobalMemorySchema;
      } catch (e) {
        // Schema doesn't exist, which is fine for new schemas
      }
      
      const now = new Date().toISOString();
      
      const globalSchema: GlobalMemorySchema = {
        ...schema,
        createdAt: existingSchema?.createdAt || now,
        updatedAt: now,
        isActive: existingSchema?.isActive ?? true,
        version: (existingSchema?.version || 0) + 1
      };

      await map.set(schema.id, globalSchema as unknown as Record<string, unknown>);
      
      // Update local state
      setSchemas(prev => ({
        ...prev,
        [schema.id]: globalSchema
      }));
      close();
      setEditingSchema(null);
    } catch (err) {
      console.error("Failed to save schema:", err);
      setError(`Failed to save schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Delete schema
  const deleteSchema = async (schemaId: string) => {
    try {
      if (!syncClient) {
        throw new Error("Sync client not available");
      }

      const map = await syncClient.map("memory_schemas");
      await map.remove(schemaId);
      
      // Update local state
      setSchemas(prev => {
        const { [schemaId]: removed, ...remaining } = prev;
        return remaining;
      });
    } catch (err) {
      console.error("Failed to delete schema:", err);
      setError(`Failed to delete schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Toggle schema active state
  const toggleSchemaActive = async (schemaId: string, isActive: boolean) => {
    try {
      if (!syncClient) {
        throw new Error("Sync client not available");
      }

      const map = await syncClient.map("memory_schemas");
      const existingItem = await map.get(schemaId);
      
      if (!existingItem?.data) {
        throw new Error(`Schema ${schemaId} not found`);
      }

      const existingSchema = existingItem.data as GlobalMemorySchema;
      const updatedSchema: GlobalMemorySchema = {
        ...existingSchema,
        isActive,
        updatedAt: new Date().toISOString(),
        version: existingSchema.version + 1
      };

      await map.set(schemaId, updatedSchema as unknown as Record<string, unknown>);
      
      // Update local state
      setSchemas(prev => ({
        ...prev,
        [schemaId]: updatedSchema
      }));
    } catch (err) {
      console.error("Failed to toggle schema:", err);
      setError(`Failed to toggle schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Create new schema
  const handleNewSchema = () => {
    setEditingSchema({
      id: "",
      name: "",
      description: "",
      properties: {}
    });
    open();
  };

  // Edit existing schema
  const handleEditSchema = (schema: GlobalMemorySchema) => {
    setEditingSchema({
      id: schema.id,
      name: schema.name,
      description: schema.description,
      properties: schema.properties
    });
    open();
  };

  // Initialize demo schemas if none exist
  const initializeDemoSchemas = async () => {
    try {
      for (const [schemaId, schema] of Object.entries(DEMO_SCHEMAS)) {
        await saveSchema(schema);
      }
    } catch (err) {
      console.error("Failed to initialize demo schemas:", err);
      setError(`Failed to initialize demo schemas: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    loadSchemas();
  }, [syncClient]);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Text>Loading memory schemas...</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <Group justify="space-between">
          <Group>
            <IconBrain size={32} />
            <Title order={1}>Memory Schemas</Title>
          </Group>
          <Group>
            {Object.keys(schemas).length === 0 && (
              <Button
                variant="outline"
                onClick={initializeDemoSchemas}
              >
                Initialize Demo Schemas
              </Button>
            )}
            <Button 
              leftSection={<IconPlus size={16} />}
              onClick={handleNewSchema}
            >
              New Schema
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert 
            icon={<IconAlertCircle size={16} />} 
            title="Error" 
            color="red"
            onClose={() => setError(null)}
            withCloseButton
          >
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Memory schemas define the structure of information that will be extracted from conversations.
          {Object.keys(schemas).length === 0 && " No custom schemas defined yet."}
        </Text>

        <SchemaList
          schemas={schemas}
          onEdit={handleEditSchema}
          onDelete={deleteSchema}
          onToggleActive={toggleSchemaActive}
        />

        <Modal
          opened={opened}
          onClose={() => {
            close();
            setEditingSchema(null);
          }}
          title={editingSchema?.id ? "Edit Schema" : "New Schema"}
          size="xl"
        >
          {editingSchema && (
            <SchemaEditor
              schema={editingSchema}
              onSave={saveSchema}
              onCancel={() => {
                close();
                setEditingSchema(null);
              }}
            />
          )}
        </Modal>
      </Stack>
    </Container>
  );
}