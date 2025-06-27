import { z } from "zod";

// Schema for getting profile traits by external ID
export const GetProfileTraitsSchema = z
    .object({
        external_id: z
            .string()
            .min(1, "External ID is required (e.g., email:user@example.com)"),
        space_id: z.string().optional(),
    })
    .strict();

// Schema for getting profile events by external ID
export const GetProfileEventsSchema = z
    .object({
        external_id: z
            .string()
            .min(1, "External ID is required (e.g., email:user@example.com)"),
        limit: z.number().min(1).max(200).optional(),
        cursor: z.string().optional(),
        space_id: z.string().optional(),
    })
    .strict();

// Schema for getting profile past chat by external ID
export const GetProfilePastChatSchema = z
    .object({
        external_id: z
            .string()
            .min(1, "External ID is required (e.g., email:user@example.com)"),
        limit: z.number().min(1).max(200).optional(),
        cursor: z.string().optional(),
        space_id: z.string().optional(),
    })
    .strict();


// Schema for identify events
export const IdentifyEventSchema = z
    .object({
        user_id: z.string().min(1, "User ID is required"),
        traits: z.record(z.any()).optional(),
        anonymous_id: z.string().optional(),
        timestamp: z.string().optional(),
        context: z.record(z.any()).optional(),
        integrations: z.record(z.any()).optional(),
    })
    .strict();

export type GetProfileTraitsInput = z.infer<typeof GetProfileTraitsSchema>;
export type GetProfileEventsInput = z.infer<typeof GetProfileEventsSchema>;
export type GetProfilePastChatInput = z.infer<typeof GetProfilePastChatSchema>;
export type IdentifyEventInput = z.infer<typeof IdentifyEventSchema>;
