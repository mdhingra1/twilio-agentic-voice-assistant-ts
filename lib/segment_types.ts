// Segment Profile API Types
export interface ExternalId {
    id: string;
    type: string;
    source_id?: string;
    collection?: string;
    created_at?: string;
    encoding?: string;
}

// Updated Profile Event structure to match API response
export interface ProfileEvent {
    external_ids: ExternalId[];
    context: {
        ip?: string;
        library?: {
            name: string;
            version: string;
        };
        page?: {
            path?: string;
            referrer?: string;
            search?: string;
            title?: string;
            url?: string;
        };
        traits?: Record<string, any>;
        userAgent?: string;
        [key: string]: any;
    };
    type: string;
    message_id: string;
    source_id: string;
    timestamp: string;
    properties: Record<string, any>;
    event: string;
    related?: {
        users?: string;
    };
}

// API Response structures
export interface ProfileTraitsResponse {
    traits: Record<string, any>;
    cursor: {
        url: string;
        has_more: boolean;
        next: string;
    };
}

export interface ProfileEventsResponse {
    data: ProfileEvent[];
    cursor: {
        url: string;
        has_more: boolean;
        next: string;
    };
}

// Segment Tracking API Types
export interface TrackEvent {
    userId?: string;
    anonymousId?: string;
    event: string;
    properties?: Record<string, any>;
    context?: TrackContext;
    timestamp?: string;
    messageId?: string;
    integrations?: Record<string, any>;
}

export interface IdentifyEvent {
    userId: string;
    anonymousId?: string;
    traits?: Record<string, any>;
    context?: TrackContext;
    timestamp?: string;
    messageId?: string;
    integrations?: Record<string, any>;
}

export interface TrackContext {
    app?: Record<string, any>;
    device?: Record<string, any>;
    ip?: string;
    library?: {
        name: string;
        version: string;
    };
    locale?: string;
    location?: Record<string, any>;
    network?: Record<string, any>;
    os?: Record<string, any>;
    page?: Record<string, any>;
    referrer?: Record<string, any>;
    screen?: Record<string, any>;
    timezone?: string;
    user_agent?: string;
    [key: string]: any;
}

// AI Copilot Specific Event Types
export interface AIConversationEvent extends TrackEvent {
    event:
        | "AI Conversation Started"
        | "AI Conversation Ended"
        | "AI Message Sent"
        | "AI Response Received";
    properties: {
        conversation_id: string;
        model_name?: string;
        input_tokens?: number;
        output_tokens?: number;
        response_time_ms?: number;
        conversation_context?: Record<string, any>;
        success?: boolean;
        error_details?: string;
        [key: string]: any;
    };
}

export interface AIFeedbackEvent extends TrackEvent {
    event: "AI Feedback Given";
    properties: {
        conversation_id: string;
        message_id: string;
        feedback_type: "thumbs_up" | "thumbs_down" | "rating";
        feedback_value?: number;
        feedback_text?: string;
        [key: string]: any;
    };
}

// Configuration Types
export interface SegmentConfig {
    profileApiToken: string;
    trackingWriteKey: string;
    workspaceId: string;
    spaceId: string;
    profileApiBaseUrl: string;
    trackingApiBaseUrl: string;
    logLevel: string;
    rateLimit: number;
    // Transport configuration
    transport: "stdio" | "http";
    httpPort?: number;
    httpHost?: string;
}
