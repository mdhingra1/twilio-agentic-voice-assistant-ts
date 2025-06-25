import { useAppSelector } from "@/state/hooks";
import { getHistoricalContext } from "@/state/sessions";
import { Paper, Text, Title, Badge, Divider, Group, Stack } from "@mantine/core";
import { TruncatedText } from "./TruncateText";

export function HistoricalContextContainer({ callSid }: { callSid: string }) {
  const historicalContext = useAppSelector((state) => 
    getHistoricalContext(state, callSid)
  );

  if (!historicalContext?.hasHistory) {
    return (
      <Paper className="paper">
        <Title order={4}>Historical Context</Title>
        <Text size="sm" c="dimmed">
          No previous conversation history available for this customer.
        </Text>
      </Paper>
    );
  }

  const formatLastCallDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return "Unknown";
    }
  };

  return (
    <Paper className="paper">
      <Stack gap="sm">
        <Title order={4}>Historical Context</Title>
        
        <div>
          <Text size="sm" fw={500} mb={4}>
            Last Contact:
          </Text>
          <Text size="sm" c="dimmed">
            {formatLastCallDate(historicalContext.lastCallDate)}
          </Text>
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>
            Common Topics:
          </Text>
          <Group gap="xs">
            {historicalContext.commonTopics.length > 0 ? (
              historicalContext.commonTopics.map((topic, index) => (
                <Badge key={index} size="sm" variant="light" color="blue">
                  {topic}
                </Badge>
              ))
            ) : (
              <Text size="sm" c="dimmed">No topics identified</Text>
            )}
          </Group>
        </div>

        <Divider />

        <div>
          <Text size="sm" fw={500} mb={4}>
            Previous Conversations:
          </Text>
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.4 }}>
            <TruncatedText 
              text={historicalContext.formattedContext} 
              maxLength={500} 
            />
          </Text>
        </div>

        {historicalContext.topicSpecificContext && (
          <>
            <Divider />
            <div>
              <Text size="sm" fw={500} mb={4} c="orange">
                🎯 Topic-Specific Context:
              </Text>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.4 }}>
                <TruncatedText 
                  text={historicalContext.topicSpecificContext} 
                  maxLength={300} 
                />
              </Text>
            </div>
            
            {historicalContext.relatedTopics && historicalContext.relatedTopics.length > 0 && (
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Related Topics:
                </Text>
                <Group gap="xs">
                  {historicalContext.relatedTopics.map((topic, index) => (
                    <Badge key={index} size="sm" variant="outline" color="orange">
                      {topic}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}
          </>
        )}

        <Divider />
        
        <Text size="xs" c="dimmed" fs="italic">
          💡 This context is being used by the AI agent to provide personalized responses
        </Text>
      </Stack>
    </Paper>
  );
}