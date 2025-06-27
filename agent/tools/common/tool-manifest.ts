import type { ToolDefinition } from "../../types.js";

export const commonToolManifest: ToolDefinition[] = [
  {
    name: "getEntity",
    description:
      "Get all rows for a specific entity based on the datagraph such as Accounts or Transactions. Calls may need to be chained.",
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
          description:
            "The row to retrieve from the entity table, should be the value of the primary key",
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
    name: "searchCustomerTransactions",
    description:
      "Search customer transactions by merchant name or approximate amount. Returns recent transactions sorted by date. Use this to help customers find specific charges they're asking about.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        merchantName: {
          type: "string",
          description:
            "Name of merchant to search for (e.g., 'Walmart', 'Amazon', 'Starbucks'). Partial matches work well.",
        },
        approximateAmount: {
          type: "number",
          description:
            "Approximate transaction amount. The search will find transactions within 20% of this amount to account for fees, taxes, etc.",
        },
      },
      required: [],
    },
  },
  {
    name: "createDisputeCase",
    description:
      "Create a formal dispute case for a credit card transaction. This generates a comprehensive case summary for human agent review.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        transactionId: {
          type: "string",
          description: "The ID of the transaction being disputed",
        },
        reason: {
          type: "string",
          description:
            "Reason for the dispute (e.g., 'Unrecognized charge', 'Unauthorized transaction')",
        },
        customerNotes: {
          type: "string",
          description: "Additional notes or context from the customer",
        },
      },
      required: ["transactionId", "reason"],
    },
  },
  {
    name: "transferDisputeToAgent",
    description:
      "Transfer a credit card dispute case to a human agent with comprehensive context and case details. Use this after creating a dispute case when customer needs human assistance.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        disputeCaseId: {
          type: "string",
          description: "The ID of the dispute case being transferred",
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level for the transfer (default: medium)",
        },
        customerNotes: {
          type: "string",
          description:
            "Additional context or customer concerns to relay to the human agent",
        },
      },
      required: ["disputeCaseId"],
    },
  },
];
