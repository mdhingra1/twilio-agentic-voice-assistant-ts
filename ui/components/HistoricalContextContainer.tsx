import { useAppSelector } from "@/state/hooks";
import {
  getHistoricalContext,
  getDynamicSemanticContext,
} from "@/state/sessions";
import {
  Paper,
  Text,
  Title,
  Badge,
  Divider,
  Group,
  Stack,
  Indicator,
  Timeline,
  ThemeIcon,
  Box,
  Card,
  Flex,
} from "@mantine/core";
import { TruncatedText } from "./TruncateText";

export function HistoricalContextContainer({ callSid }: { callSid: string }) {
  const historicalContext = useAppSelector((state) =>
    getHistoricalContext(state, callSid)
  );
  const dynamicSemanticContext = useAppSelector((state) =>
    getDynamicSemanticContext(state, callSid)
  );

  if (!historicalContext?.hasHistory && !dynamicSemanticContext) {
    return (
      <Paper className="paper">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color="gray">
              📋
            </ThemeIcon>
            <Title order={4}>Conversation Memory</Title>
          </Group>
          <Card bg="gray.0" p="md" radius="md">
            <Text size="sm" c="dimmed" ta="center">
              No previous conversation history found for this customer.
            </Text>
            <Text size="xs" c="dimmed" ta="center" mt="xs" fs="italic">
              The AI will start fresh without historical context.
            </Text>
          </Card>
        </Stack>
      </Paper>
    );
  }

  const formatLastCallDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "green";
    if (confidence >= 0.65) return "yellow";
    if (confidence >= 0.4) return "orange";
    return "red";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High Confidence";
    if (confidence >= 0.65) return "Good Match";
    if (confidence >= 0.4) return "Moderate Match";
    return "Low Confidence";
  };

  // Parse and format conversation history for better readability
  const parseConversationHistory = (formattedContext: string) => {
    if (!formattedContext) return [];

    // Split by bullet points and filter out empty strings
    const conversations = formattedContext
      .split("•")
      .map((conv) => conv.trim())
      .filter((conv) => conv.length > 0);

    return conversations.map((conv, index) => {
      // Extract date, topics, and content
      const dateMatch = conv.match(/^(\d{4}-\d{2}-\d{2})/);
      const topicsMatch = conv.match(/\(Topics: ([^)]+)\):/);
      const contentMatch = conv.match(/Call Summary: (.+)/);

      const date = dateMatch ? dateMatch[1] : "Unknown Date";
      const topics = topicsMatch ? topicsMatch[1] : "No specific topics";
      const content = contentMatch ? contentMatch[1] : conv;

      return {
        id: index,
        date,
        topics:
          topics === "No specific topics"
            ? []
            : topics.split(", ").filter((t) => t.trim()),
        content: content.replace(/\.\s*Topics:.*$/, ""), // Remove trailing topics
        summary: content.split(".")[0] + ".", // First sentence as summary
      };
    });
  };

  return (
    <Paper className="paper">
      <Stack gap="lg">
        <Group gap="xs">
          <ThemeIcon size="sm" variant="light" color="blue">
            🧠
          </ThemeIcon>
          <Title order={4}>Conversation Memory</Title>
          <Badge size="xs" variant="light" color="blue">
            Active
          </Badge>
        </Group>

        <Timeline active={2} bulletSize={20} lineWidth={2}>
          {/* Phase 1: Call Start Context */}
          <Timeline.Item
            bullet={
              <ThemeIcon size="xs" color="blue">
                🏁
              </ThemeIcon>
            }
            title={
              <Text fw={600} size="sm">
                Call Start Context
              </Text>
            }
          >
            <Text size="xs" c="dimmed" mb="xs">
              Loaded when call begins • Provides immediate customer background
            </Text>

            {historicalContext?.hasHistory ? (
              <Card bg="blue.0" p="sm" radius="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="xs" fw={500}>
                      Customer History Found
                    </Text>
                    <Badge size="xs" color="blue" variant="light">
                      {historicalContext.userHistory?.totalConversations || 0}{" "}
                      calls
                    </Badge>
                  </Group>

                  <div>
                    <Text size="xs" c="dimmed">
                      Last contact:{" "}
                      {formatLastCallDate(historicalContext.lastCallDate)}
                    </Text>
                    {historicalContext.commonTopics.length > 0 && (
                      <Group gap={4} mt={4}>
                        <Text size="xs" c="dimmed">
                          Topics:
                        </Text>
                        {historicalContext.commonTopics
                          .slice(0, 3)
                          .map((topic, index) => (
                            <Badge
                              key={index}
                              size="xs"
                              variant="outline"
                              color="blue"
                            >
                              {topic}
                            </Badge>
                          ))}
                      </Group>
                    )}
                  </div>

                  <Stack gap="xs">
                    {parseConversationHistory(
                      historicalContext.formattedContext
                    )
                      .slice(1, 4)
                      .map((conversation) => (
                        <Card
                          key={conversation.id}
                          bg="white"
                          p="xs"
                          radius="sm"
                          style={{ border: "1px solid #e9ecef" }}
                        >
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <Text size="xs" fw={600} c="blue.8">
                                {formatLastCallDate(conversation.date)}
                              </Text>
                              <Group gap={2}>
                                {conversation.topics
                                  .slice(0, 2)
                                  .map((topic, idx) => (
                                    <Badge
                                      key={idx}
                                      size="xs"
                                      variant="dot"
                                      color="blue"
                                    >
                                      {topic}
                                    </Badge>
                                  ))}
                              </Group>
                            </Group>

                            <Text
                              size="xs"
                              fw={500}
                              c="dark"
                              style={{ lineHeight: 1.3 }}
                            >
                              {conversation.summary}
                            </Text>

                            <Text
                              size="xs"
                              c="dimmed"
                              style={{ lineHeight: 1.3 }}
                            >
                              <TruncatedText
                                text={conversation.content
                                  .replace(conversation.summary, "")
                                  .trim()}
                                maxLength={120}
                              />
                            </Text>
                          </Stack>
                        </Card>
                      ))}
                  </Stack>
                </Stack>
              </Card>
            ) : (
              <Card bg="gray.0" p="sm" radius="sm">
                <Text size="xs" c="dimmed">
                  No previous history found
                </Text>
              </Card>
            )}
          </Timeline.Item>

          {/* Phase 2: Topic-Specific Context */}
          <Timeline.Item
            bullet={
              <ThemeIcon size="xs" color="orange">
                🎯
              </ThemeIcon>
            }
            title={
              <Text fw={600} size="sm">
                Topic-Specific Context
              </Text>
            }
          >
            <Text size="xs" c="dimmed" mb="xs">
              Triggered when specific topics are detected • Deep-dive into
              relevant history
            </Text>

            {historicalContext?.topicSpecificContext ? (
              <Card bg="orange.0" p="sm" radius="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="xs" fw={500}>
                      Topic Context Active
                    </Text>
                    <Badge size="xs" color="orange" variant="light">
                      Focused
                    </Badge>
                  </Group>

                  {historicalContext.relatedTopics &&
                    historicalContext.relatedTopics.length > 0 && (
                      <Group gap={4}>
                        <Text size="xs" c="dimmed">
                          Related:
                        </Text>
                        {historicalContext.relatedTopics
                          .slice(0, 3)
                          .map((topic, index) => (
                            <Badge
                              key={index}
                              size="xs"
                              variant="outline"
                              color="orange"
                            >
                              {topic}
                            </Badge>
                          ))}
                      </Group>
                    )}

                  <Card
                    bg="white"
                    p="xs"
                    radius="sm"
                    style={{ border: "1px solid #e9ecef" }}
                  >
                    <Text size="xs" c="dark" style={{ lineHeight: 1.3 }}>
                      <TruncatedText
                        text={historicalContext.topicSpecificContext}
                        maxLength={200}
                      />
                    </Text>
                  </Card>
                </Stack>
              </Card>
            ) : (
              <Card bg="gray.0" p="sm" radius="sm">
                <Text size="xs" c="dimmed">
                  No specific topics detected yet
                </Text>
              </Card>
            )}
          </Timeline.Item>

          {/* Phase 3: Real-Time Semantic Context */}
          <Timeline.Item
            bullet={
              dynamicSemanticContext ? (
                <Indicator color="green" size={6} processing>
                  <ThemeIcon size="xs" color="green">
                    🔍
                  </ThemeIcon>
                </Indicator>
              ) : (
                <ThemeIcon size="xs" color="gray">
                  🔍
                </ThemeIcon>
              )
            }
            title={
              <Text fw={600} size="sm">
                Real-Time Semantic Enrichment
              </Text>
            }
          >
            <Text size="xs" c="dimmed" mb="xs">
              Activated during conversation • Finds relevant context using AI
              semantic matching
            </Text>

            {dynamicSemanticContext ? (
              <Card bg="green.0" p="sm" radius="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="xs" fw={500}>
                      Semantic Match Found
                    </Text>
                    <Group gap={4}>
                      <Badge
                        size="xs"
                        color={getConfidenceColor(
                          dynamicSemanticContext.confidence
                        )}
                        variant="light"
                      >
                        {getConfidenceLabel(dynamicSemanticContext.confidence)}
                      </Badge>
                      <Badge size="xs" color="green" variant="filled">
                        {(dynamicSemanticContext.confidence * 100).toFixed(0)}%
                      </Badge>
                    </Group>
                  </Group>

                  <Card bg="green.1" p="xs" radius="sm">
                    <Text size="xs" fw={500} c="green.8" mb={2}>
                      User said: "{dynamicSemanticContext.lastQuery}"
                    </Text>
                    <Text size="xs" c="green.7">
                      System found{" "}
                      {dynamicSemanticContext.semanticMatches.length} relevant
                      conversation
                      {dynamicSemanticContext.semanticMatches.length !== 1
                        ? "s"
                        : ""}
                    </Text>
                  </Card>

                  <Stack gap={6}>
                    {dynamicSemanticContext.semanticMatches.map(
                      (match, index) => (
                        <Card
                          key={match.id}
                          bg="white"
                          p="xs"
                          radius="sm"
                          style={{ border: "1px solid #e9ecef" }}
                        >
                          <Flex justify="space-between" align="center" mb={4}>
                            <Text size="xs" fw={500} c="green.8">
                              Match #{index + 1}
                            </Text>
                            <Group gap={4}>
                              <Badge size="xs" color="green" variant="light">
                                {(match.score * 100).toFixed(0)}%
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {formatLastCallDate(match.timestamp)}
                              </Text>
                            </Group>
                          </Flex>
                          <Text size="xs" c="dark" style={{ lineHeight: 1.3 }}>
                            <TruncatedText
                              text={match.content}
                              maxLength={150}
                            />
                          </Text>
                        </Card>
                      )
                    )}
                  </Stack>

                  <Text size="xs" c="green.6" fs="italic">
                    Updated:{" "}
                    {new Date(
                      dynamicSemanticContext.updatedAt
                    ).toLocaleTimeString()}
                  </Text>
                </Stack>
              </Card>
            ) : (
              <Card bg="gray.0" p="sm" radius="sm">
                <Stack gap="xs">
                  <Text size="xs" c="dimmed">
                    Waiting for conversation to analyze...
                  </Text>
                  <Text size="xs" c="dimmed" fs="italic">
                    Will automatically find relevant context as customer speaks
                  </Text>
                </Stack>
              </Card>
            )}
          </Timeline.Item>
        </Timeline>

        <Divider />

        <Card bg="blue.0" p="sm" radius="sm">
          <Group gap="xs">
            <Text size="xs" fw={500} c="blue.8">
              💡 How it works:
            </Text>
          </Group>
          <Text size="xs" c="blue.7" style={{ lineHeight: 1.4 }}>
            The AI uses this context to provide personalized responses,
            reference past conversations, and maintain continuity across
            customer interactions. More relevant context = better responses.
          </Text>
        </Card>
      </Stack>
    </Paper>
  );
}
