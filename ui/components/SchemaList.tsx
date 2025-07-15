import { 
  Card, 
  Group, 
  Text, 
  Badge, 
  Button, 
  Stack, 
  ActionIcon,
  Switch,
  Code,
  Collapse
} from "@mantine/core";
import { 
  IconEdit, 
  IconTrash, 
  IconChevronDown, 
  IconChevronRight,
  IconClock,
  IconHash
} from "@tabler/icons-react";
import { useState } from "react";
import type { GlobalMemorySchema } from "../shared/memory/types";

interface SchemaListProps {
  schemas: Record<string, GlobalMemorySchema>;
  onEdit: (schema: GlobalMemorySchema) => void;
  onDelete: (schemaId: string) => void;
  onToggleActive: (schemaId: string, isActive: boolean) => void;
}

export function SchemaList({ schemas, onEdit, onDelete, onToggleActive }: SchemaListProps) {
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  const toggleExpanded = (schemaId: string) => {
    const newExpanded = new Set(expandedSchemas);
    if (newExpanded.has(schemaId)) {
      newExpanded.delete(schemaId);
    } else {
      newExpanded.add(schemaId);
    }
    setExpandedSchemas(newExpanded);
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (isActive: boolean): string => {
    return isActive ? "green" : "gray";
  };

  const schemaEntries = Object.entries(schemas);

  if (schemaEntries.length === 0) {
    return (
      <Card withBorder>
        <Text c="dimmed" ta="center">
          No memory schemas defined yet. Create your first schema to get started.
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {schemaEntries.map(([schemaId, schema]) => {
        const isExpanded = expandedSchemas.has(schemaId);
        const propertyCount = Object.keys(schema.properties).length;
        
        return (
          <Card key={schemaId} withBorder padding="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="sm">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => toggleExpanded(schemaId)}
                  >
                    {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  </ActionIcon>
                  
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text fw={600} size="sm">
                        {schema.name}
                      </Text>
                      <Badge
                        color={getStatusColor(schema.isActive)}
                        size="sm"
                        variant="light"
                      >
                        {schema.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      ID: <Code>{schema.id}</Code>
                    </Text>
                  </Stack>
                </Group>

                <Group gap="xs">
                  <Switch
                    checked={schema.isActive}
                    onChange={(event) => onToggleActive(schemaId, event.currentTarget.checked)}
                    label="Active"
                    size="sm"
                  />
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconEdit size={14} />}
                    onClick={() => onEdit(schema)}
                  >
                    Edit
                  </Button>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete schema "${schema.name}"?`)) {
                        onDelete(schemaId);
                      }
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>

              <Text size="sm" c="dimmed">
                {schema.description}
              </Text>

              <Group gap="md">
                <Group gap="xs">
                  <IconHash size={14} />
                  <Text size="xs" c="dimmed">
                    {propertyCount} {propertyCount === 1 ? 'property' : 'properties'}
                  </Text>
                </Group>
                <Group gap="xs">
                  <IconClock size={14} />
                  <Text size="xs" c="dimmed">
                    Updated {formatDate(schema.updatedAt)}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Version {schema.version}
                </Text>
              </Group>

              <Collapse in={isExpanded}>
                <Stack gap="sm">
                  <Text size="sm" fw={500}>Properties:</Text>
                  <Stack gap="xs">
                    {Object.entries(schema.properties).map(([propName, propDef]) => {
                      const def = propDef as any;
                      return (
                        <Card key={propName} withBorder radius="sm" p="xs">
                          <Group justify="space-between">
                            <Group gap="xs">
                              <Code>{propName}</Code>
                              <Badge size="xs" variant="outline">
                                {def.type}
                                {def.type === 'array' && def.items?.type && `<${def.items.type}>`}
                              </Badge>
                            </Group>
                            <Group gap="xs">
                              {def.enum && (
                                <Badge size="xs" color="blue" variant="light">
                                  {def.enum.length} options
                                </Badge>
                              )}
                            </Group>
                          </Group>
                          {def.description && (
                            <Text size="xs" c="dimmed" mt={4}>
                              {def.description}
                            </Text>
                          )}
                          {def.enum && (
                            <Text size="xs" c="dimmed" mt={2}>
                              Options: {def.enum.join(', ')}
                            </Text>
                          )}
                        </Card>
                      );
                    })}
                  </Stack>
                </Stack>
              </Collapse>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}