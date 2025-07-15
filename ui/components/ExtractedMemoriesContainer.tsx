import { useAppSelector } from "@/state/hooks";
import { selectSessionById } from "@/state/sessions";
import { Paper, Text, Title, Group, Stack } from "@mantine/core";
import { IconBrain } from "@tabler/icons-react";
import { MemoryViewer } from "./MemoryViewer";
import type { UserMemories } from "../shared/memory/types";

interface ExtractedMemoriesContainerProps {
  callSid: string;
}

export function ExtractedMemoriesContainer({ callSid }: ExtractedMemoriesContainerProps) {
  const session = useAppSelector((state) => selectSessionById(state, callSid));

  if (!session) {
    return (
      <Paper className="paper">
        <Stack gap="md">
          <Group align="center" gap="xs">
            <IconBrain size={20} />
            <Title order={4}>Extracted Memories</Title>
          </Group>
          <Text size="sm" c="dimmed">
            No session data available
          </Text>
        </Stack>
      </Paper>
    );
  }

  const { user } = session;
  const traits = user?.traits || {};
  const memories = extractMemoriesFromTraits(traits);

  return (
    <Paper className="paper">
      <MemoryViewer memories={memories} />
    </Paper>
  );
}

function extractMemoriesFromTraits(traits: any): UserMemories {
  const memories: UserMemories = {};

  // Extract memory records from top-level traits
  // Look for any trait that has the memory record structure (data, confidence, lastUpdated, etc.)
  for (const [key, value] of Object.entries(traits)) {
    if (
      value &&
      typeof value === "object" &&
      'data' in value &&
      'confidence' in value &&
      'lastUpdated' in value
    ) {
      memories[key] = value as any;
    }
  }

  return memories;
}