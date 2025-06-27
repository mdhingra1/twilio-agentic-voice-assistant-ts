import type { ToolDefinition } from "../../types.js";

export const commonToolManifest: ToolDefinition[] = [
  {
    name: "getProfileTraits",
    description:
        "Get user traits from Segment Profile API using external ID (e.g., email:user@example.com)",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        external_id: {
          type: "string",
          description:
              "The external identifier in format type:value (e.g., email:user@example.com)",
        },
        space_id: {
          type: "string",
          description:
              "Optional Segment space ID (uses default if not provided)",
        },
      },
      required: ["external_id"],
    },
  },
  {
    name: "getProfileEvents",
    description:
        "Get user events from Segment Profile API using external ID (e.g., email:user@example.com)",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        external_id: {
          type: "string",
          description:
              "The external identifier in format type:value (e.g., email:user@example.com)",
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return (1-200)",
          // minimum: 1,
          // maximum: 200,
        },
        cursor: {
          type: "string",
          description: "Cursor for pagination to get next page of events",
        },
        space_id: {
          type: "string",
          description:
              "Optional Segment space ID (uses default if not provided)",
        },
      },
      required: ["external_id"],
    },
  },
  {
    name: "identify_user",
    description: "Update user traits and profile information in Segment",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The unique identifier for the user",
        },
        traits: {
          type: "object",
          description: "User traits to update",
          properties: {},
          additionalProperties: true,
        },
        anonymous_id: {
          type: "string",
          description: "Anonymous identifier to link with user_id",
        },
        timestamp: {
          type: "string",
          description: "ISO 8601 timestamp (defaults to current time)",
        },
        context: {
          type: "object",
          description: "Additional context information",
          properties: {},
          additionalProperties: true,
        },
        integrations: {
          type: "object",
          description: "Integration-specific settings",
          properties: {},
          additionalProperties: true,
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "getEntity",
    description: "Get all rows for a specific entity based on the datagraph such as Accounts or Transactions. Calls may need to be chained.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          description: "The name of the entity",
        },
        rowId: {
          type: "string",
          description: "The row to retrieve from the entity table, should be the value of the primary key",
        },
      },
      required: ["entity", "rowId"],
    },
  },
  {
    name: "getUserByEmailOrPhone",
    description: "Find a user by their email address or their phone number.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "The user's email address" },
        phone: {
          type: "string",
          description: "The user's phone in e164 format, i.e. +12223330001",
        },
      },
      required: [],
    },
  },
  {
    name: "getOrderByConfirmationNumber",
    description: "Find an order by its confirmation number.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "The ID of the order" },
      },
      required: ["orderId"],
    },
  },
  {
    name: "getUserOrders",
    description: "Get all orders for a specific user.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user id from the user record",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "executeRefund",
    description: "Execute a refund for a given order",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        authority: {
          type: "string",
          description:
            "Explain why you have the authority to process this refund. The permission requirements are listed in the procedures section of the system instructions.",
        },
        orderId: {
          type: "string",
          description: "The id of the order being refunded.",
        },
        orderLineIds: {
          type: "array",
          items: { type: "string" },
          description:
            "The ids of the line items that are needed to be refunded.",
        },
        reason: {
          type: "string",
          description: "The reason the order is being refunded.",
        },
      },
      required: ["authority", "orderId", "orderLineIds", "reason"],
    },
  },
  {
    name: "sendSmsRefundNotification",
    description:
      "Send an SMS message to the user with details about the refund in question.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The id of the order being refunded.",
        },
        orderLineIds: {
          type: "array",
          items: { type: "string" },
          description:
            "The ids of the line items that are needed to be refunded.",
        },
      },
      required: ["orderId", "orderLineIds"],
    },
  },
];
