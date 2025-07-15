import { GovernanceContainer } from "@/components/GovernanceContainer";
import { HistoricalContextContainer } from "@/components/HistoricalContextContainer";
import { UserProfileContainer } from "@/components/UserProfileContainer";
import { ExtractedMemoriesContainer } from "@/components/ExtractedMemoriesContainer";
import { TruncatedText } from "@/components/TruncateText";
import { useAppSelector } from "@/state/hooks";
import {
  getAuxMessageState,
  getQuestionState,
  getSummaryState,
} from "@/state/sessions";
import { selectCallTurns, selectTurnById } from "@/state/turns";
import { redactPhoneNumbers } from "@/util/strings";
import {
  Badge,
  Button,
  Collapse,
  Paper,
  Table,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useRouter } from "next/router";
import React from "react";

export default function LiveCallPage() {
  const theme = useMantineTheme();

  return (
    <div style={{ display: "flex", gap: theme.spacing.sm }}>
      <div style={{ flex: 2 }}>
        <Conscious />
      </div>

      <div style={{ flex: 1 }}>
        <Profile />
      </div>

      <div style={{ flex: 1 }}>
        <AIContextSystem />
      </div>
    </div>
  );
}

function Conscious() {
  const router = useRouter();
  const callSid = router.query.callSid as string;
  const [advancedSectionsOpen, setAdvancedSectionsOpen] = React.useState(false);

  const theme = useMantineTheme();

  const summaryState = useAppSelector((state) =>
    getSummaryState(state, callSid)
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
      }}
    >
      <Paper
        className="paper"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title order={3}>Conscious Bot</Title>
        <Title order={6}>{summaryState?.title}</Title>
      </Paper>

      <Paper
        className="paper"
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div>
          <Title order={4}>Conversation</Title>
        </div>
        <TurnsTable callSid={callSid} />
      </Paper>

      <Paper className="paper">
        <Title order={4}>Auxiliary Messages</Title>
        <AuxiliaryMessageTable />
      </Paper>

      {/* Collapsible Advanced Sections */}
      <Paper className="paper">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Title order={4}>Advanced Monitoring</Title>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setAdvancedSectionsOpen(!advancedSectionsOpen)}
            style={{ fontSize: "0.8rem" }}
          >
            {advancedSectionsOpen ? "Hide Details" : "Show Details"}
          </Button>
        </div>

        <Collapse in={advancedSectionsOpen}>
          <div
            style={{
              marginTop: theme.spacing.md,
              display: "flex",
              flexDirection: "column",
              gap: theme.spacing.sm,
            }}
          >
            <Paper className="paper">
              <Title order={5}>Human in the Loop</Title>
              <HumanInTheLoop />
            </Paper>

            <SummarySection />

            <Paper className="paper">
              <GovernanceContainer callSid={callSid} />
            </Paper>
          </div>
        </Collapse>
      </Paper>
    </div>
  );
}

/****************************************************
 Profile Column
****************************************************/
function Profile() {
  const router = useRouter();
  const callSid = router.query.callSid as string;

  const theme = useMantineTheme();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
      }}
    >
      <Paper className="paper">
        <Title order={3}>Profile</Title>
      </Paper>

      <UserProfileContainer callSid={callSid} />
    </div>
  );
}

/****************************************************
 Conversation Memory Column
****************************************************/
function AIContextSystem() {
  const router = useRouter();
  const callSid = router.query.callSid as string;

  const theme = useMantineTheme();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
      }}
    >
      <ExtractedMemoriesContainer callSid={callSid} />

      <Paper className="paper">
        <Title order={3}>Conversation Memory</Title>
      </Paper>

      <HistoricalContextContainer callSid={callSid} />
    </div>
  );
}

/****************************************************
 Turns Table
****************************************************/

function TurnsTable({ callSid }: { callSid: string }) {
  const turns = useAppSelector((state) => selectCallTurns(state, callSid));
  const theme = useMantineTheme();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new turns are added
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length]);

  // Reverse the turns array to show chronological order (earliest first)
  const chronologicalTurns = [...turns].reverse();

  return (
    <div
      ref={scrollRef}
      style={{
        minHeight: "300px",
        maxHeight: "500px",
        overflow: "auto",
        border: `1px solid ${theme.colors.gray[3]}`,
        borderRadius: theme.radius.sm,
      }}
    >
      <Table stickyHeader>
        <Table.Thead>
          <Table.Tr style={{ backgroundColor: theme.colors.gray[1] }}>
            <Table.Th style={{ width: "100px", fontWeight: 600 }}>
              Participant
            </Table.Th>
            <Table.Th style={{ width: "50px", fontWeight: 600 }}>Type</Table.Th>
            <Table.Th style={{ width: "100%", fontWeight: 600 }}>
              Content
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {chronologicalTurns.map((turn, index) => (
            <Table.Tr
              key={`me7-${turn.id}`}
              style={{
                borderBottom: `1px solid ${theme.colors.gray[2]}`,
                marginBottom: theme.spacing.xs,
              }}
            >
              {turn.role === "bot" && <BotRow turnId={turn.id} />}
              {turn.role === "human" && <HumanRow turnId={turn.id} />}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}

interface TurnRow {
  turnId: string;
}

function BotRow({ turnId }: TurnRow) {
  const turn = useAppSelector((state) => selectTurnById(state, turnId));
  if (turn.role !== "bot")
    throw Error(`Expected bot turn ${JSON.stringify(turn)}`); // typeguard

  let content: string[] = [];
  let isToolCall = false;

  if (turn.type === "tool") {
    isToolCall = true;
    for (const tool of turn.tool_calls) {
      const fn = tool.function.name;
      const args = redactPhoneNumbers(JSON.stringify(tool.function.arguments));
      content.push(`${fn}(${args})`.replaceAll("\\", ""));
    }
  } else content = [turn.content];

  const theme = useMantineTheme();

  // Different background colors for different bot turn types
  const backgroundColor = isToolCall
    ? theme.colors.blue[0]
    : theme.colors.green[0];

  const borderLeft = isToolCall
    ? `4px solid ${theme.colors.blue[4]}`
    : `4px solid ${theme.colors.green[4]}`;

  return (
    <>
      <Table.Td
        style={{
          backgroundColor,
          borderLeft,
          fontWeight: 500,
          width: "100px",
          minWidth: "100px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.spacing.xs,
          }}
        >
          {isToolCall ? "🔧" : "🤖"} {turn.role}
        </div>
      </Table.Td>
      <Table.Td
        style={{
          backgroundColor,
          fontSize: "0.85rem",
          color: theme.colors.gray[6],
          width: "100px",
          minWidth: "100px",
        }}
      >
        {isToolCall ? (
          <Badge size="xs" color="blue" variant="light">
            tool
          </Badge>
        ) : (
          <Badge size="xs" color="green" variant="light">
            {turn.origin}
          </Badge>
        )}
      </Table.Td>
      <Table.Td
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: theme.spacing.xs,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {content.map((item, index) => (
              <div
                key={`d93-${item}-${index}`}
                style={{
                  fontFamily: isToolCall ? "monospace" : "inherit",
                  fontSize: isToolCall ? "0.85rem" : "inherit",
                  color: isToolCall ? theme.colors.blue[7] : "inherit",
                  padding: isToolCall ? `${theme.spacing.xs}px 0` : "0",
                  borderBottom:
                    isToolCall && index < content.length - 1
                      ? `1px solid ${theme.colors.blue[2]}`
                      : "none",
                }}
              >
                {isToolCall && "→ "}
                {item}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: theme.spacing.xs,
              alignItems: "flex-start",
            }}
          >
            {turn.status === "interrupted" && (
              <Badge color="yellow" size="sm">
                Interrupted
              </Badge>
            )}
            {isToolCall && (
              <Badge color="blue" size="sm" variant="outline">
                {content.length} call{content.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </Table.Td>
    </>
  );
}

function HumanRow({ turnId }: TurnRow) {
  const turn = useAppSelector((state) => selectTurnById(state, turnId));
  if (turn.role !== "human")
    throw Error(`Expected human turn ${JSON.stringify(turn)}`); // typeguard
  if (turn.origin === "hack") return;

  const theme = useMantineTheme();

  // Human turns get a different visual treatment
  const backgroundColor = theme.colors.orange[0];
  const borderLeft = `4px solid ${theme.colors.orange[4]}`;

  return (
    <>
      <Table.Td
        style={{
          backgroundColor,
          borderLeft,
          fontWeight: 500,
          width: "100px",
          minWidth: "100px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.spacing.xs,
          }}
        >
          👤 {turn.role}
        </div>
      </Table.Td>
      <Table.Td
        style={{
          backgroundColor,
          fontSize: "0.85rem",
          color: theme.colors.gray[6],
          width: "50px",
          minWidth: "50px",
        }}
      >
        <Badge size="xs" color="orange" variant="light">
          {turn.type}
        </Badge>
      </Table.Td>
      <Table.Td
        style={{
          backgroundColor,
          fontStyle: "italic",
          color: theme.colors.gray[8],
        }}
      >
        "{turn.content}"
      </Table.Td>
    </>
  );
}

/****************************************************
 Human Consultation
****************************************************/

function HumanInTheLoop() {
  const router = useRouter();
  const callSid = router.query.callSid as string;

  const questionState = useAppSelector((state) =>
    getQuestionState(state, callSid)
  );

  const questions = questionState ? Object.values(questionState) : [];

  return (
    <Table stickyHeader>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: "22%" }}>Question</Table.Th>
          <Table.Th style={{ width: "22%" }}>Explanation</Table.Th>
          <Table.Th style={{ width: "22%" }}>Recommendation</Table.Th>
          <Table.Th style={{ width: "22%" }}>Answer</Table.Th>
          <Table.Th style={{ width: "40px" }}>Status</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {questions.map((question) => (
          <QuestionRow
            key={`k3c-${question.id}`}
            callSid={callSid}
            questionId={question.id}
          />
        ))}
      </Table.Tbody>
    </Table>
  );
}

function QuestionRow({
  callSid,
  questionId,
}: {
  callSid: string;
  questionId: string;
}) {
  const questionState = useAppSelector((state) =>
    getQuestionState(state, callSid)
  );
  if (!questionState) return;

  const question = questionState[questionId];
  if (!question) return;

  return (
    <Table.Tr>
      <Table.Td style={{ width: "22%" }}> {question.question}</Table.Td>
      <Table.Td style={{ width: "22%" }}>
        <TruncatedText text={question?.explanation} maxLength={250} />
      </Table.Td>
      <Table.Td style={{ width: "22%" }}>
        <TruncatedText text={question?.recommendation ?? ""} maxLength={250} />
      </Table.Td>
      <Table.Td style={{ width: "22%" }}> {question.answer}</Table.Td>
      <Table.Td style={{ width: "40px" }}>
        {question.status === "new" && question.status}
        {question.status === "special" && question.status}

        {question.status === "approved" && (
          <Badge color="green"> {question.status}</Badge>
        )}
        {question.status === "rejected" && (
          <Badge color="red"> {question.status}</Badge>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

/****************************************************
 Auxiliary Messages
****************************************************/
function AuxiliaryMessageTable() {
  const router = useRouter();
  const callSid = router.query.callSid as string;

  const auxMessageState = useAppSelector((state) =>
    getAuxMessageState(state, callSid)
  );

  const messages = auxMessageState ? Object.values(auxMessageState) : [];

  return (
    <Table stickyHeader>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Channel</Table.Th>
          <Table.Th>From</Table.Th>
          <Table.Th>To</Table.Th>
          <Table.Th>Body</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {messages.map((msg) => (
          <AuxMessageRow
            key={`id3-${msg.id}`}
            callSid={callSid}
            msgId={msg.id}
          />
        ))}
      </Table.Tbody>
    </Table>
  );
}

function AuxMessageRow({ callSid, msgId }: { callSid: string; msgId: string }) {
  const auxMessageState = useAppSelector((state) =>
    getAuxMessageState(state, callSid)
  );
  if (!auxMessageState) return;

  const msg = auxMessageState[msgId];
  if (!msg) return;

  return (
    <Table.Tr>
      <Table.Td> {msg.channel}</Table.Td>
      <Table.Td> {redactPhoneNumbers(msg.from)}</Table.Td>
      <Table.Td> {redactPhoneNumbers(msg.to)}</Table.Td>
      <Table.Td> {msg.body}</Table.Td>
    </Table.Tr>
  );
}

function SummarySection() {
  const router = useRouter();
  const callSid = router.query.callSid as string;

  const summaryState = useAppSelector((state) =>
    getSummaryState(state, callSid)
  );

  return (
    <Paper
      className="paper"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <Title order={4}>Voice Operators</Title>
      <Text size="sm">
        <b>Call Summary: </b>
        <TruncatedText text={summaryState?.description} maxLength={250} />
      </Text>

      <Text size="sm">
        <b>Topics: </b>
        {summaryState?.topics.join(", ")}
      </Text>
    </Paper>
  );
}
