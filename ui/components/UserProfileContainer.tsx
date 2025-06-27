import { useAppSelector } from "@/state/hooks";
import { selectSessionById } from "@/state/sessions";
import { TruncatedText } from "@/components/TruncateText";
import { redactPhoneNumbers } from "@/util/strings";
import {
  Badge,
  Card,
  Group,
  Paper,
  Table,
  Text,
  Title,
  Divider,
  Stack,
  Grid,
  Accordion,
  Box,
} from "@mantine/core";
import {
  IconUser,
  IconPhone,
  IconMapPin,
  IconClock,
  IconTag,
} from "@tabler/icons-react";

interface UserProfileContainerProps {
  callSid: string;
}

export function UserProfileContainer({ callSid }: UserProfileContainerProps) {
  const session = useAppSelector((state) => selectSessionById(state, callSid));
  
  if (!session) {
    return (
      <Paper className="paper">
        <Title order={4}>User Profile</Title>
        <Text size="sm" c="dimmed">No session data available</Text>
      </Paper>
    );
  }

  const { user, call, historicalContext } = session;

  return (
    <Paper className="paper">
      <Stack gap="md">
        <Group align="center" gap="xs">
          <IconUser size={20} />
          <Title order={4}>User Profile</Title>
        </Group>

        {user ? (
          <UserProfileDetails user={user} call={call} historicalContext={historicalContext} />
        ) : (
          <Text size="sm" c="dimmed">No user profile available</Text>
        )}
      </Stack>
    </Paper>
  );
}

interface UserProfileDetailsProps {
  user: any;
  call: any;
  historicalContext?: any;
}

function UserProfileDetails({ user, call, historicalContext }: UserProfileDetailsProps) {
  // Extract clean user ID (remove "user_id:" prefix if present)
  const getUserId = () => {
    if (!user?.user_id) return 'Unknown';
    const rawUserId = user.user_id;
    if (typeof rawUserId === 'string' && rawUserId.startsWith('user_id:')) {
      return rawUserId.replace('user_id:', '');
    }
    return rawUserId;
  };

  // Helper to parse trait value - split by comma and extract name/value
  const parseTraitValue = (value: string) => {
    if (typeof value !== 'string') {
      return { name: String(value), value: '' };
    }
    
    const parts = value.split(',');
    if (parts.length >= 2) {
      return {
        name: parts[0].trim(),
        value: parts.slice(1).join(',').trim()
      };
    }
    
    // If no comma, treat the whole value as the name
    return { name: value.trim(), value: '' };
  };

  const userId = getUserId();
  const traits = user?.traits || {};
  const events = user?.events || [];

  return (
    <Stack gap="md">
      {/* Basic User Information */}
      <Card withBorder radius="md" p="md">
        <Grid gutter="md">
          <Grid.Col span={6}>
            <Group gap="xs" mb="xs">
              <IconUser size={16} />
              <Text fw={500} size="sm">User ID</Text>
            </Group>
            <Text size="sm" c="dimmed">{userId}</Text>
          </Grid.Col>
          
          <Grid.Col span={6}>
            <Group gap="xs" mb="xs">
              <IconPhone size={16} />
              <Text fw={500} size="sm">Phone Number</Text>
            </Group>
            <Text size="sm" c="dimmed">
              {call?.participantPhone ? redactPhoneNumbers(call.participantPhone) : 'N/A'}
            </Text>
          </Grid.Col>

          {traits.city && (
            <Grid.Col span={6}>
              <Group gap="xs" mb="xs">
                <IconMapPin size={16} />
                <Text fw={500} size="sm">City</Text>
              </Group>
              <Text size="sm" c="dimmed">{traits.city}</Text>
            </Grid.Col>
          )}

          {traits.state && (
            <Grid.Col span={6}>
              <Group gap="xs" mb="xs">
                <IconMapPin size={16} />
                <Text fw={500} size="sm">State</Text>
              </Group>
              <Text size="sm" c="dimmed">{traits.state}</Text>
            </Grid.Col>
          )}
        </Grid>
      </Card>

      {/* User Traits */}
      {Object.keys(traits).length > 0 ? (
        <Accordion defaultValue="traits">
          <Accordion.Item value="traits">
            <Accordion.Control>
              <Group gap="xs">
                <IconTag size={16} />
                <Text fw={500}>User Traits ({Object.keys(traits).length})</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Trait Name</Table.Th>
                    <Table.Th>Trait Value</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(traits)
                    .filter(([key, value]) => value && value !== '' && value !== 'null' && value !== 'undefined')
                    .map(([key, value]) => {
                      const parsed = parseTraitValue(String(value));
                      return (
                        <Table.Tr key={key}>
                          <Table.Td>
                            <Text size="sm" fw={500}>{parsed.name}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{parsed.value || 'N/A'}</Text>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                </Table.Tbody>
              </Table>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      ) : (
        <Card withBorder radius="md" p="md">
          <Group gap="xs" mb="xs">
            <IconTag size={16} />
            <Text fw={500} size="sm">User Traits</Text>
          </Group>
          <Text size="sm" c="dimmed">No additional user traits available</Text>
        </Card>
      )}


      {/* Recent Events */}
      {events.length > 0 && (
        <Accordion>
          <Accordion.Item value="events">
            <Accordion.Control>
              <Group gap="xs">
                <IconClock size={16} />
                <Text fw={500}>Recent Events ({events.length})</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Timestamp</Table.Th>
                    <Table.Th>Properties</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {events.slice(0, 10).map((event: any, index: number) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Text size="sm" fw={500}>{event.event}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {new Date(event.timestamp).toLocaleString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <TruncatedText 
                          text={JSON.stringify(event.properties || {})} 
                          maxLength={100} 
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {/* Call Details */}
      <Card withBorder radius="md" p="md">
        <Text fw={500} size="sm" mb="md">Current Call Details</Text>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm">Direction:</Text>
            <Badge variant={call?.direction === 'inbound' ? 'filled' : 'outline'}>
              {call?.direction || 'Unknown'}
            </Badge>
          </Group>
          
          <Group justify="space-between">
            <Text size="sm">Status:</Text>
            <Badge 
              color={
                call?.status === 'in-progress' ? 'blue' :
                call?.status === 'completed' ? 'green' :
                call?.status === 'failed' ? 'red' : 'gray'
              }
            >
              {call?.status || 'Unknown'}
            </Badge>
          </Group>
          
          {call?.startedAt && (
            <Group justify="space-between">
              <Text size="sm">Started:</Text>
              <Text size="sm" c="dimmed">
                {new Date(call.startedAt).toLocaleString()}
              </Text>
            </Group>
          )}
          
          {call?.recordingUrl && (
            <Group justify="space-between">
              <Text size="sm">Recording:</Text>
              <Badge variant="outline" color="green">Available</Badge>
            </Group>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}