import { useState } from "react";
import { 
  Button, 
  Group, 
  Stack, 
  Alert,
  Text,
  Code,
  Box 
} from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import Editor from '@monaco-editor/react';
import type { MemorySchema } from "../shared/memory/types";

interface SchemaEditorProps {
  schema: MemorySchema;
  onSave: (schema: MemorySchema) => Promise<void>;
  onCancel: () => void;
}

interface ValidationError {
  field: string;
  message: string;
}

export function SchemaEditor({ schema, onSave, onCancel }: SchemaEditorProps) {
  const [schemaJson, setSchemaJson] = useState(JSON.stringify(schema, null, 2));
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Validate schema structure
  const validateSchema = (parsedSchema: any): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!parsedSchema.id || typeof parsedSchema.id !== 'string') {
      errors.push({ field: 'id', message: 'Schema must have a valid string id' });
    } else if (!/^[a-zA-Z0-9_]+$/.test(parsedSchema.id)) {
      errors.push({ field: 'id', message: 'Schema ID can only contain letters, numbers, and underscores' });
    }

    if (!parsedSchema.name || typeof parsedSchema.name !== 'string') {
      errors.push({ field: 'name', message: 'Schema must have a valid string name' });
    }

    if (!parsedSchema.description || typeof parsedSchema.description !== 'string') {
      errors.push({ field: 'description', message: 'Schema must have a valid string description' });
    }

    if (!parsedSchema.properties || typeof parsedSchema.properties !== 'object') {
      errors.push({ field: 'properties', message: 'Schema must have a properties object' });
    } else {
      const propertyCount = Object.keys(parsedSchema.properties).length;
      if (propertyCount === 0) {
        errors.push({ field: 'properties', message: 'Schema must have at least one property' });
      } else if (propertyCount > 50) {
        errors.push({ field: 'properties', message: 'Schema cannot have more than 50 properties' });
      }

      // Validate individual properties
      for (const [propName, propDef] of Object.entries(parsedSchema.properties)) {
        if (typeof propDef !== 'object' || !propDef) {
          errors.push({ field: `properties.${propName}`, message: 'Property definition must be an object' });
          continue;
        }

        const propObj = propDef as any;
        if (!propObj.type || typeof propObj.type !== 'string') {
          errors.push({ field: `properties.${propName}`, message: 'Property must have a valid type' });
        }

        // Validate enum values if present
        if (propObj.enum && (!Array.isArray(propObj.enum) || propObj.enum.length === 0)) {
          errors.push({ field: `properties.${propName}`, message: 'Enum must be a non-empty array' });
        }

        // Validate array items if type is array
        if (propObj.type === 'array' && propObj.items && typeof propObj.items !== 'object') {
          errors.push({ field: `properties.${propName}`, message: 'Array items must be defined as an object' });
        }
      }
    }

    return errors;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setParseError(null);
      setValidationErrors([]);

      // Parse JSON
      let parsed: any;
      try {
        parsed = JSON.parse(schemaJson);
      } catch (e) {
        setParseError("Invalid JSON format");
        return;
      }

      // Validate schema
      const errors = validateSchema(parsed);
      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }

      // Save the schema
      await onSave(parsed);
    } catch (error) {
      console.error("Error saving schema:", error);
      setParseError(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const getSchemaTemplate = (): string => {
    return JSON.stringify({
      id: "my_custom_schema",
      name: "My Custom Schema",
      description: "Description of what this schema captures",
      properties: {
        example_field: {
          type: "string",
          description: "Example string field"
        },
        category_field: {
          type: "string",
          enum: ["option1", "option2", "option3"],
          description: "Example field with predefined options"
        },
        list_field: {
          type: "array",
          items: { type: "string" },
          description: "Example array field"
        },
        number_field: {
          type: "number",
          description: "Example number field"
        }
      }
    }, null, 2);
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Define the structure of memory information to extract from conversations.
        Use JSON Schema format to specify field types and constraints.
      </Text>

      {(parseError || validationErrors.length > 0) && (
        <Alert 
          icon={<IconAlertCircle size={16} />} 
          title="Validation Error" 
          color="red"
        >
          {parseError && <Text size="sm">{parseError}</Text>}
          {validationErrors.map((error, index) => (
            <Text key={index} size="sm">
              <Code>{error.field}</Code>: {error.message}
            </Text>
          ))}
        </Alert>
      )}

      <Box>
        <Text size="sm" fw={500} mb="xs">Memory Schema (JSON)</Text>
        <Text size="xs" c="dimmed" mb="md">
          Define the structure using JSON Schema format
        </Text>
        <Box style={{ border: '1px solid #e0e0e0', borderRadius: '4px' }}>
          <Editor
            height="400px"
            defaultLanguage="json"
            value={schemaJson}
            onChange={(value) => setSchemaJson(value || '')}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              formatOnPaste: true,
              formatOnType: true,
              wordWrap: 'on',
              bracketPairColorization: { enabled: true },
              suggest: {
                showKeywords: true,
                showSnippets: true
              }
            }}
            theme="vs"
          />
        </Box>
      </Box>

      <details>
        <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
          <Text size="sm" c="dimmed">Show template example</Text>
        </summary>
        <Code block style={{ fontSize: '12px', maxHeight: '200px', overflow: 'auto' }}>
          {getSchemaTemplate()}
        </Code>
      </details>

      <Group justify="flex-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={handleSave}
          loading={saving}
        >
          Save Schema
        </Button>
      </Group>
    </Stack>
  );
}