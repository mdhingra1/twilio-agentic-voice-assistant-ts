import type { ToolDefinition, ToolExecutor } from "../../agent/types.js";
import { ConversationRelayAdapter } from "../../completion-server/twilio/conversation-relay.js";
import { TWILIO_ACCOUNT_SID } from "../../shared/env.js";
import type { TransferToFlexHandoff } from "./types.js";

export const transferToFlexAgentSpec: ToolDefinition = {
  name: "transferToAgent",
  description: "Transfers the call to a Flex agent with comprehensive customer context",
  type: "function",
  parameters: {
    type: "object",
    properties: {
      conversationSummary: {
        type: "string",
        description:
          "A comprehensive summary of the conversation including the customer's request, any issues discussed, and context needed for the human agent.",
      },
    },
    required: ["conversationSummary"],
  },
};

interface TransferToFlexAgent {
  conversationSummary: string;
}

export const transferToFlexAgent: ToolExecutor<TransferToFlexAgent> = async (
  args,
  deps,
) => {
  const relay = deps.relay as ConversationRelayAdapter<TransferToFlexHandoff>;

  // Check if Flex is properly configured
  if (!TWILIO_ACCOUNT_SID) {
    deps.log.error("flex-transfer", "TWILIO_ACCOUNT_SID not configured");
    return "Error: Flex transfer not configured - missing TWILIO_ACCOUNT_SID";
  }

  // Create optimized customer data for handoff (avoiding large objects that could cause serialization issues)
  const turns = deps.store.turns.list();
  const recentTurns = turns.slice(-10); // Only include last 10 turns to avoid size issues
  
  const enhancedCustomerData = {
    // Basic user information
    userId: deps.store.context.user?.user_id,
    userTraits: deps.store.context.user?.traits || {},
    
    // Call context
    callDetails: {
      callSid: deps.store.context.call?.callSid,
      participantPhone: deps.store.context.call?.participantPhone,
      direction: deps.store.context.call?.direction,
      startedAt: deps.store.context.call?.startedAt,
    },
    
    // Historical context summary (avoid large objects)
    historicalSummary: {
      hasHistory: deps.store.context.historicalContext?.hasHistory || false,
      totalConversations: deps.store.context.historicalContext?.userHistory?.totalConversations || 0,
      commonTopics: deps.store.context.historicalContext?.commonTopics || [],
      lastCallDate: deps.store.context.historicalContext?.lastCallDate,
    },
    
    // Current call summary
    currentTopics: deps.store.context.summary?.topics || [],
    
    // Recent conversation context (limited to prevent size issues)
    recentConversation: recentTurns.map(turn => ({
      role: turn.role,
      content: turn.content?.substring(0, 500), // Limit content length
      timestamp: turn.createdAt,
    })),
    
    // Auxiliary messages count (avoid including full message bodies)
    auxiliaryMessagesCount: Object.keys(deps.store.context.auxiliaryMessages || {}).length,
  };

  deps.log.info(
    "flex-transfer", 
    `Transferring call ${deps.store.context.call?.callSid} to Flex with enhanced data`,
    { 
      customerDataKeys: Object.keys(enhancedCustomerData),
      summaryLength: args.conversationSummary?.length || 0
    }
  );

  setTimeout(() => {
    try {
      // Enhance conversation summary with dispute information if available
      let enhancedSummary = args.conversationSummary ?? "N/A";
      
      // Check if this is a dispute case and include detailed dispute information
      const auxiliaryMessages = deps.store.context.auxiliaryMessages || {};
      const disputeMessages = Object.values(auxiliaryMessages).filter(msg => 
        msg.body.includes("DISPUTE CASE CREATED") || msg.body.includes("CREDIT CARD DISPUTE")
      );
      
      if (disputeMessages.length > 0) {
        const disputeDetails = disputeMessages.map(msg => msg.body).join("\n\n");
        enhancedSummary = `${enhancedSummary}\n\n=== DISPUTE CASE DETAILS ===\n${disputeDetails}`;
      }

      const handoffData = {
        reasonCode: "transfer-to-flex" as const,
        conversationSummary: enhancedSummary,
        customerData: enhancedCustomerData,
      };

      // Test JSON serialization before sending
      const testSerialization = JSON.stringify(handoffData);
      deps.log.debug("flex-transfer", `Handoff data size: ${testSerialization.length} characters`);

      relay.end(handoffData);
      
      deps.log.info("flex-transfer", "Handoff data sent successfully");
    } catch (error) {
      deps.log.error("flex-transfer", `Error during handoff: ${error}`);
      
      // Fallback with minimal data if main handoff fails
      relay.end({
        reasonCode: "transfer-to-flex" as const,
        conversationSummary: args.conversationSummary ?? "Transfer requested - see customer data for details",
        customerData: {
          userId: deps.store.context.user?.user_id,
          phone: deps.store.context.call?.participantPhone,
          fallback: true,
        },
      });
    }
  }, 3000);

  return "call-transfer-in-progress";
};
