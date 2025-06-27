import type { Procedure } from "../types.js";

export const procedures: Record<string, Procedure> = [
  {
    id: "fetch_entity",
    description:
      "Use the provided datagraph and getEntity tool to fetch the information needed by the user",
    steps: [
      {
        id: "learn_datagraph",
        description:
          "Learn the customers datagraph to understand the relationship between tables in their data warehouse.",
        strictness: "required",
      },
      {
        id: "get_entity_chain",
        description:
          "use the getEntity tool to fetch the information needed by the user",
        strictness: "required",
        completionCriteria: "Data rows have been fetched",
        instructions:
          "Use getEntity tool, may require chaining across multiple entity/table relationships.",
      },
    ],
  },
  {
    id: "identify_user",
    description:
      "Verify the identity of a user through context or active identification",
    steps: [
      {
        id: "get_identifier",
        description:
          "Gather an identifier from the user that can be used to lookup their account.",
        strictness: "conditional",
        completionCriteria:
          "Valid email address or phone number has been provided",
        conditions:
          "This is not required when the user's profile has been provided in context. ",
        instructions: "",
      },
      {
        id: "verify_identifier",
        description: "Verify the provided identifier is valid",
        strictness: "conditional",
        completionCriteria: "Identifier has been validated",
        conditions: "Required when get_identifier step was performed",
        instructions:
          "Ensure email format is valid or phone number is in correct format",
      },
      {
        id: "confirm_identity",
        description: "Confirm user identity using available information",
        strictness: "required",
        completionCriteria: "User has verbally confirmed their identity",
        instructions:
          "If profile exists in context, confirm name. Otherwise, confirm details from identifier.",
      },
    ],
  },
  {
    id: "handle_credit_card_dispute",
    description:
      "Handle credit card dispute inquiries with context preservation between calls",
    steps: [
      {
        id: "check_existing_dispute_context",
        description:
          "Review historical context for any existing dispute discussions",
        strictness: "required",
        completionCriteria:
          "Historical context has been reviewed for dispute-related conversations",
        instructions:
          "Examine the provided historical context for previous conversations about unrecognized charges, disputes, or transaction issues",
      },
      {
        id: "acknowledge_previous_dispute",
        description:
          "Acknowledge any previous dispute inquiry found in conversation history",
        strictness: "conditional",
        conditions:
          "Only required if existing dispute context is found in historical conversation data",
        completionCriteria:
          "Customer has been acknowledged regarding their previous dispute inquiry",
        instructions:
          "Reference the previous dispute discussion from historical context and ask if they want to continue with that issue",
      },
      {
        id: "identify_disputed_transaction",
        description:
          "Gather information about the charge the customer doesn't recognize",
        strictness: "critical",
        completionCriteria:
          "Specific merchant name and transaction details have been identified",
        instructions:
          "Ask for merchant name, approximate amount, and date. Use searchCustomerTransactions tool to find matching transactions",
      },
      {
        id: "save_dispute_context",
        description:
          "Ensure dispute context is captured in conversation summary for future reference",
        strictness: "required",
        completionCriteria:
          "Dispute information has been clearly discussed and will be captured in conversation summary",
        instructions:
          "Clearly state the dispute details during the conversation so they are captured in the call summary and available for future calls",
      },
      {
        id: "handle_call_interruption",
        description: "Gracefully handle if customer needs to end call suddenly",
        strictness: "conditional",
        conditions: "Only if customer indicates they need to end the call",
        completionCriteria:
          "Customer has been assured their information is saved",
        instructions:
          "Acknowledge their need to go, summarize the dispute information discussed, and invite them to call back to continue the dispute process",
      },
      {
        id: "gather_additional_details",
        description: "Collect comprehensive dispute information",
        strictness: "required",
        completionCriteria: "All necessary dispute details have been collected",
        instructions:
          "Get reason for dispute, any additional context, and confirm transaction details",
      },
      {
        id: "create_formal_dispute_case",
        description: "Create comprehensive dispute case for human agent review",
        strictness: "critical",
        completionCriteria:
          "Dispute case has been created using createDisputeCase tool",
        instructions:
          "Use createDisputeCase tool with transaction ID, reason, and customer notes",
      },
      {
        id: "transfer_to_human_agent",
        description: "Transfer dispute case to human agent with full context",
        strictness: "critical",
        completionCriteria:
          "Dispute case has been successfully transferred to human agent using transferDisputeToAgent tool",
        instructions:
          "Use transferDisputeToAgent tool with the dispute case ID to transfer call with comprehensive context",
      },
      {
        id: "explain_next_steps",
        description: "Inform customer about next steps in dispute process",
        strictness: "required",
        completionCriteria:
          "Customer understands the dispute process timeline and next steps",
        instructions:
          "Explain that case has been prepared for human agent review and they will be contacted within 1-2 business days",
      },
    ],
  },
].reduce((acc, cur) => Object.assign(acc, { [cur.id]: cur }), {});
