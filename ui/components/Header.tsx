import { useAppSelector } from "@/state/hooks";
import { getCallData } from "@/state/sessions";
import { ActionIcon, Text, useMantineTheme, Group, Button } from "@mantine/core";
import { IconRecordMail, IconBrain } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { HoverCard } from "@mantine/core";

export function Header() {
  const router = useRouter();

  const callSid = router.query.callSid as string;

  const call = useAppSelector((state) => getCallData(state, callSid));

  const theme = useMantineTheme();

  return (
    <header>
      <Group justify="space-between" align="center" h="100%">
        <Link href="/">
          <img className="header-logo" alt="logo" src={"/logo.png"} />
        </Link>

        <Group gap="md">
          <Link href="/memory-schemas" style={{ textDecoration: 'none' }}>
            <Button 
              variant="subtle" 
              leftSection={<IconBrain size={16} />}
              size="sm"
            >
              Memory Schemas
            </Button>
          </Link>
          
          <Group gap="xs">
            {callSid && <Text size="xs">{callSid}</Text>}
            {callSid && <RecordingLink callSid={callSid} />}
          </Group>
        </Group>
      </Group>
    </header>
  );
}

function RecordingLink({ callSid }: { callSid: string }) {
  const call = useAppSelector((state) => getCallData(state, callSid));

  return (
    <HoverCard>
      <HoverCard.Target>
        <a
          href={call?.recordingUrl ?? ""}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ActionIcon>
            <IconRecordMail />
          </ActionIcon>
        </a>
      </HoverCard.Target>

      <HoverCard.Dropdown>
        <Text size="xs">Call Recording</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
