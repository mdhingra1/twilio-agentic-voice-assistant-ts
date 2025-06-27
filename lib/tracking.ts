import axios, { AxiosInstance } from "axios";
import { TrackEvent, IdentifyEvent} from "segment_types.js";

const DEFAULT_API_BASE_URL = "https://api.segment.io/v1";

export class SegmentTrackingClient {
    private client: AxiosInstance;
    private writeKey: string;

    constructor(token: string) {
        this.writeKey = token;
        this.client = axios.create({
            baseURL: DEFAULT_API_BASE_URL,
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 10000,
            auth: {
                username: token,
                password: "",
            },
        });
    }

    /**
     * Send a track event to Segment
     */
    async track(event: TrackEvent): Promise<void> {
        try {
            const payload = {
                ...event,
                type: "track",
                timestamp: event.timestamp || new Date().toISOString(),
                context: {
                    library: {
                        name: "segment-mcp-server",
                        version: "1.0.0",
                    },
                    ...event.context,
                },
            };

            await this.client.post("/track", payload);
        } catch (error: any) {
            throw new Error(`Failed to track event: ${error.message}`);
        }
    }

    /**
     * Send an identify event to Segment
     */
    async identify(event: IdentifyEvent): Promise<void> {
        try {
            const payload = {
                ...event,
                type: "identify",
                timestamp: event.timestamp || new Date().toISOString(),
                context: {
                    library: {
                        name: "segment-mcp-server",
                        version: "1.0.0",
                    },
                    ...event.context,
                },
            };

            await this.client.post("/identify", payload);
        } catch (error: any) {
            throw new Error(`Failed to identify user: ${error.message}`);
        }
    }

    /**
     * Track AI conversation started event
     */
    async trackAIConversationStarted(
        userId: string,
        conversationId: string,
        properties: Record<string, any> = {},
        anonymousId?: string
    ): Promise<void> {
        const event: TrackEvent = {
            userId,
            anonymousId,
            event: "AI Conversation Started",
            properties: {
                conversation_id: conversationId,
                ...properties,
            },
        };

        await this.track(event);
    }

    /**
     * Track AI conversation ended event
     */
    async trackAIConversationEnded(
        userId: string,
        conversationId: string,
        properties: Record<string, any> = {},
        anonymousId?: string
    ): Promise<void> {
        const event: TrackEvent = {
            userId,
            anonymousId,
            event: "AI Conversation Ended",
            properties: {
                conversation_id: conversationId,
                ...properties,
            },
        };

        await this.track(event);
    }

    /**
     * Track AI message sent event
     */
    async trackAIMessageSent(
        userId: string,
        conversationId: string,
        messageContent: string,
        properties: Record<string, any> = {},
        anonymousId?: string
    ): Promise<void> {
        const event: TrackEvent = {
            userId,
            anonymousId,
            event: "AI Message Sent",
            properties: {
                conversation_id: conversationId,
                message_content: messageContent,
                ...properties,
            },
        };

        await this.track(event);
    }

    /**
     * Track AI response received event
     */
    async trackAIResponseReceived(
        userId: string,
        conversationId: string,
        responseContent: string,
        properties: Record<string, any> = {},
        anonymousId?: string
    ): Promise<void> {
        const event: TrackEvent = {
            userId,
            anonymousId,
            event: "AI Response Received",
            properties: {
                conversation_id: conversationId,
                response_content: responseContent,
                ...properties,
            },
        };

        await this.track(event);
    }

    /**
     * Track AI feedback event
     */
    async trackAIFeedback(
        userId: string,
        conversationId: string,
        messageId: string,
        feedbackType: "thumbs_up" | "thumbs_down" | "rating",
        feedbackValue?: number,
        feedbackText?: string,
        anonymousId?: string
    ): Promise<void> {
        const event: TrackEvent = {
            userId,
            anonymousId,
            event: "AI Feedback Given",
            properties: {
                conversation_id: conversationId,
                message_id: messageId,
                feedback_type: feedbackType,
                feedback_value: feedbackValue,
                feedback_text: feedbackText,
            },
        };

        await this.track(event);
    }

    /**
     * Batch track multiple events
     */
    async batchTrack(events: TrackEvent[]): Promise<void> {
        try {
            const payload = {
                batch: events.map((event) => ({
                    ...event,
                    type: "track",
                    timestamp: event.timestamp || new Date().toISOString(),
                    context: {
                        library: {
                            name: "segment-mcp-server",
                            version: "1.0.0",
                        },
                        ...event.context,
                    },
                })),
            };

            await this.client.post("/batch", payload);
        } catch (error: any) {
            throw new Error(`Failed to batch track events: ${error.message}`);
        }
    }
}
