import { Router, type RequestHandler } from "express";
import type { WebsocketRequestHandler } from "express-ws";
import { getAgentConfig } from "../agent/index.js";
import { deleteLogger, getMakeLogger } from "../lib/logger.js";
import { hasEndPunctuation } from "../lib/sentences.js";
import { prettyXML } from "../lib/xml.js";
import {
  makeTransferToFlexHandoff,
  type TransferToFlexHandoff,
} from "../modules/flex-transfer-to-agent/index.js";
import { GovernanceService } from "../modules/governance/index.js";
import { SummarizationService } from "../modules/summarization/index.js";
import { VectorStoreService } from "../services/vector-store/index.js";
import { ContextRetriever } from "../services/vector-store/context-retriever.js";
import {
  DEFAULT_TWILIO_NUMBER,
  HOSTNAME,
  SEGMENT_PROFILE_API_TOKEN,
  SEGMENT_SPACE_ID,
} from "../shared/env.js";
import type { CallDetails, SessionContext } from "../shared/session/context.js";
import { AgentResolver } from "./agent-resolver/index.js";
import { OpenAIConsciousLoop } from "./conscious-loop/openai.js";
import { makeCallDetail } from "./helpers.js";
import { SessionStore } from "./session-store/index.js";
import { warmUpSyncSession } from "./session-store/sync-client.js";
import { updateCallStatus } from "./session-store/sync-queue.js";
import {
  ConversationRelayAdapter,
  makeConversationRelayTwiML,
  type HandoffData,
  type WrapupCallWebhookPayload,
} from "./twilio/conversation-relay.js";
import {
  endCall,
  placeCall,
  startRecording,
  type TwilioCallWebhookPayload,
} from "./twilio/voice.js";
import { SegmentProfileClient } from "../lib/profile.js";

const router = Router();
const default_user = "f9708bce";
// map of phone to user
const phoneToUser: Record<string, string> = {
  "+12092421066": "f9708bce",
  "+17783220513": "99b2a3c5",
};

// Helper function to resolve userId from participantPhone
function resolveUserId(participantPhone: string): string {
  return phoneToUser[participantPhone] || default_user;
}

// Helper function to extract clean userId from user.user_id
function extractCleanUserId(user: any): string {
  if (!user?.user_id) return default_user;

  const rawUserId = user.user_id;
  if (typeof rawUserId === "string" && rawUserId.startsWith("user_id:")) {
    return rawUserId.replace("user_id:", "");
  }
  return rawUserId;
}

/****************************************************
 Phone Number Webhooks
****************************************************/
router.post("/incoming-call", async (req, res) => {
  const body = req.body as TwilioCallWebhookPayload;
  const call: CallDetails = makeCallDetail(body);

  const log = getMakeLogger(call.callSid);

  try {
    const agent = await getAgentConfig();
    await warmUpSyncSession(call.callSid); // ensure the sync session is setup before connecting to Conversation Relay

    const userId = resolveUserId(call.participantPhone);

    log.debug("about to get user history", `${userId}`);

    // Get historical context for greeting generation only
    const historicalContext = await getHistoricalContext(userId, log);

    const user = { user_id: userId };
    const profileClient = new SegmentProfileClient(
      SEGMENT_SPACE_ID,
      SEGMENT_PROFILE_API_TOKEN
    );
    try {
      const events = await profileClient.getProfileEvents(`user_id:${userId}`);
      user.events = events.data;
    } catch (error) {
      log.warn(
        "incoming-call",
        `Failed to fetch profile events for user ${userId}: ${error}`
      );
      user.events = [];
    }
    try {
      const data = await profileClient.getProfileTraits(`user_id:${userId}`);
      user.traits = data.traits;
    } catch (error) {
      log.warn(
        "incoming-call",
        `Failed to fetch profile events for user ${userId}: ${error}`
      );
      user.traits = [];
    }

    log.debug(
      "user-profile",
      `User Profile for ${userId}: ${JSON.stringify(user)}`
    );

    // Ensure we use the same userId for both user profiles and vector store operations

    const context: Partial<SessionContext> = {
      call,
      contactCenter: { waitTime: 5 + Math.floor(Math.random() * 5) },
      user: user,
    };

    const welcomeGreeting = await agent.getGreeting({
      ...agent.context,
      ...context,
      historicalContext,
    });

    const twiml = makeConversationRelayTwiML({
      ...agent.relayConfig,
      callSid: call.callSid,
      context,
      dtmfDetection: true,
      interruptByDtmf: true,
      parameters: { welcomeGreeting }, // Only pass greeting - agent config loaded fresh in WebSocket
      welcomeGreeting,
    });
    log.info("/incoming-call", "twiml\n", prettyXML(twiml));
    res.status(200).type("text/xml").end(twiml);
  } catch (error) {
    log.error("/incoming-call", "unknown error", error);
    res.status(500).json({ status: "error", error });
  }
});

router.post("/call-status", async (req, res) => {
  const callSid = req.body.CallSid as TwilioCallWebhookPayload["CallSid"];
  const callStatus = req.body
    .CallStatus as TwilioCallWebhookPayload["CallStatus"];

  const log = getMakeLogger(callSid);

  log.info(
    "/call-status",
    `call status updated to ${callStatus}, CallSid ${callSid}`
  );

  try {
    await updateCallStatus(callSid, callStatus);
  } catch (error) {
    log.warn(
      "/call-status",
      `unable to update call status in Sync, CallSid ${callSid}`
    );
  }

  deleteLogger(callSid);
  res.status(200).send();
});

/****************************************************
 Outbound Calling Routes
****************************************************/
const outboundCallHandler: RequestHandler = async (req, res) => {
  const to = req.query?.to ?? req.body?.to;
  const from = req.query?.from ?? req.body?.from ?? DEFAULT_TWILIO_NUMBER;

  const log = getMakeLogger();

  if (!to || !from) {
    const error = `Cannot place outbound call. Missing to (${to}) or from (${from})`;
    log.error("outbound", error);
    res.status(400).send({ status: "failed", error });
    return;
  }

  try {
    const url = `https://${HOSTNAME}/outbound/answer`; // The URL is executed when the callee answers and that endpoint (below) returns TwiML. It's possible to simply include TwiML in the call creation request but the websocket route includes the callSid as a param. This could be simplified a bit, but this is fine.
    const call = await placeCall({ from, to, url });

    res.status(200).json(call);
  } catch (error) {
    log.error(`/outbound, Error: `, error);
    res.status(500).json({ status: "failed", error });
  }
};

router.get("/outbound", outboundCallHandler);
router.post("/outbound", outboundCallHandler);

// This endpoint responds with TwiML to initiate the Conversation Relay connection.
// Note: This is not technically necessary; the TwiML could be included with the call creation request. This was done so the /:callSid could be included in the websocket URL, which makes that part a bit cleaner to read.
router.post("/outbound/answer", async (req, res) => {
  const body = req.body as TwilioCallWebhookPayload;
  const call: CallDetails = makeCallDetail(body);

  const log = getMakeLogger(call.callSid);

  log.info(`/outbound/answer`, `CallSid ${call.callSid}`);

  try {
    const agent = await getAgentConfig();
    await warmUpSyncSession(call.callSid); // ensure the sync session is setup before connecting to Conversation Relay

    const userId = resolveUserId(call.participantPhone);

    // Get historical context for this user
    const historicalContext = await getHistoricalContext(userId, log);
    const user = await getProfile(`user_id:${userId}`);
    log.debug(
      "user-profile",
      `User Profile for ${userId}: ${JSON.stringify(user)}`
    );

    const context: Partial<SessionContext> = {
      auxiliaryMessages: {},
      call,
      contactCenter: { waitTime: 5 + Math.floor(Math.random() * 5) },
      historicalContext,
      user: user,
    };
    const welcomeGreeting = await agent.getGreeting(context);

    const twiml = makeConversationRelayTwiML({
      ...agent.relayConfig,
      callSid: call.callSid,
      context,
      welcomeGreeting,
      parameters: { agent, welcomeGreeting },
    });
    res.status(200).type("text/xml").end(twiml);
  } catch (error) {
    log.error("/incoming-call", "unknown error", error);
    res.status(500).json({ status: "failed", error });
  }
});

/****************************************************
 Conversation Relay Websocket
****************************************************/
export const CONVERSATION_RELAY_WS_ROUTE = "/convo-relay/:callSid";
export const conversationRelayWebsocketHandler: WebsocketRequestHandler = (
  ws,
  req
) => {
  const { callSid } = req.params;
  const log = getMakeLogger(callSid);
  log.info("/convo-relay", `websocket initializing, CallSid ${callSid}`);

  const relay = new ConversationRelayAdapter<TransferToFlexHandoff>(ws);
  const store = new SessionStore(callSid);

  const agent = new AgentResolver(relay, store);
  const consciousLoop = new OpenAIConsciousLoop(store, agent, relay);

  const governanceBot = new GovernanceService(store, agent, {
    frequency: 5 * 1000,
  });
  const summaryBot = new SummarizationService(store, agent, {
    frequency: 15 * 1000,
  });

  startRecording(callSid).then(({ mediaUrl }) => {
    log.success("/convo-relay", `call recording url: ${mediaUrl}`);
    store.setContext({
      call: { ...(store.context.call as CallDetails), recordingUrl: mediaUrl },
    });
  });

  // handle setup
  relay.onSetup(async (ev) => {
    const params = ev.customParameters ?? {};

    // context is fetched in the API routes that generate the the ConversationRelay TwiML and then included as a <Parameter/>. This ensures that any data fetching, such as the user's profile, is completed before the websocket is initialized and the AI agent is engaged.
    // https://www.twilio.com/docs/voice/twiml/connect/conversationrelay#parameter-element
    const context = "context" in params ? JSON.parse(params.context) : {};

    // Always load fresh agent config and historical context in WebSocket (avoids parameter size limits)
    log.debug("setup", "Loading agent config and historical context");

    // Extract clean userId from user context, fallback to resolving from phone if needed
    const userId = context.user
      ? extractCleanUserId(context.user)
      : resolveUserId(context.call?.participantPhone || "");

    const [agentConfig, historicalContext] = await Promise.all([
      getAgentConfig(),
      getHistoricalContext(userId, log),
    ]);

    store.setContext({
      ...context,
      ...agentConfig.context,
      call: { ...context.call, conversationRelaySessionId: ev.sessionId },
      historicalContext,
    });

    // Configure agent with full configuration
    agent.configure(agentConfig);

    const greeting = JSON.parse(params.welcomeGreeting);
    if (greeting) {
      store.turns.addBotText({
        content: greeting,
        origin: "greeting",
        status: "complete",
      });
      log.info("llm.transcript", `"${greeting}"`);
    }

    // start subconscious
    governanceBot.start();
    summaryBot.start();
  });

  relay.onPrompt(async (ev) => {
    if (!ev.last) return; // do nothing on partial speech
    log.info(`relay.prompt`, `"${ev.voicePrompt}"`);

    store.turns.addHumanText({ content: ev.voicePrompt, origin: "stt" });

    // Real-time semantic context enrichment
    await enrichSemanticContext(store, ev.voicePrompt, log);

    consciousLoop.run();
  });

  relay.onInterrupt((ev) => {
    log.info(
      `relay.interrupt`,
      `human interrupted bot`,
      ev.utteranceUntilInterrupt
    );

    consciousLoop.abort();
    store.turns.redactInterruption(ev.utteranceUntilInterrupt);
  });

  relay.onDTMF((ev) => {
    log.info(`relay.dtmf`, `dtmf (human): ${ev.digit}`);
  });

  // relay.onError only emits errors received from the ConversationRelay websocket, not local errors.
  relay.onError((ev) => {
    log.error(`relay.error`, `ConversationRelay error: ${ev.description}`);
  });

  consciousLoop.on("text-chunk", (text, last, fullText) => {
    const markAsLast = last || hasEndPunctuation(text);
    relay.sendTextToken(text, markAsLast); // send each token as it is received

    if (last && fullText) log.info("llm.transcript", `"${fullText}"`);
  });

  consciousLoop.on("dtmf", (digits) => {
    relay.sendDTMF(digits);
    log.info("llm", `dtmf (bot): ${digits}`);
  });

  ws.on("close", async () => {
    governanceBot.stop();
    summaryBot.stop();

    log.info(
      "relay",
      "conversation relay ws closed.",
      "\n/** session turns **/\n",
      JSON.stringify(store.turns.list(), null, 2),
      "\n/** session context **/\n",
      JSON.stringify(store.context, null, 2)
    );

    // Store transcript in vector database
    await storeTranscriptInVectorDB(store, log);
  });
};

/****************************************************
 Executed After Conversation Relay Session Ends
 https://www.twilio.com/docs/voice/twiml/connect/conversationrelay#end-session-message
****************************************************/
type AppHandoffData = HandoffData<TransferToFlexHandoff>;
router.post("/wrapup-call", async (req, res) => {
  const payload = req.body as WrapupCallWebhookPayload;

  const callSid = req.body.CallSid;
  const log = getMakeLogger(callSid);

  if (!payload.HandoffData) {
    log.info(`/wrapup-call`, "call completed w/out handoff data");
    res.status(200).send("complete");
    return;
  }

  log.info(`/wrapup-call`, "there is handoff data in the wrapup webhook");

  let handoffData: AppHandoffData;
  try {
    handoffData = JSON.parse(payload.HandoffData) as AppHandoffData;
  } catch (error) {
    log.error(
      `/wrapup-call`,
      "Unable to parse handoffData in wrapup webhook. ",
      "Request Body: ",
      JSON.stringify(req.body)
    );
    res.status(500).send({ status: "failed", error });
    return;
  }

  try {
    switch (handoffData.reasonCode) {
      case "transfer-to-flex":
        const twiml = makeTransferToFlexHandoff(payload, handoffData);
        res.type("xml").send(twiml);
        break;

      case "error":
        log.info(
          "/wrapup-call",
          `wrapping up call that failed due to error, callSid: ${callSid}, message: ${handoffData.message}`
        );

        await endCall(callSid);
        res.status(200).send("complete");
        break;

      default:
        log.warn(
          "/wrapup-call",
          `unknown handoff reasonCode, callSid: ${callSid}`,
          JSON.stringify(handoffData)
        );
        await endCall(callSid);
        res.status(200).send("complete");
    }
  } catch (error) {
    log.error("/wrapup-call", "error while wrapping up a call. ", error);
    res.status(500).send(error);
  }
});

/****************************************************
 Vector Store Integration - Semantic Context Enrichment
****************************************************/
async function enrichSemanticContext(
  store: SessionStore,
  userQuery: string,
  log: ReturnType<typeof getMakeLogger>
): Promise<void> {
  try {
    // Extract clean userId from user context, fallback to resolving from phone if needed
    const userId = store.context?.user
      ? extractCleanUserId(store.context.user)
      : resolveUserId(store.context?.call?.participantPhone || "");

    if (!userId) return;

    // Only enrich for meaningful queries (skip very short utterances)
    if (userQuery.trim().split(" ").length < 3) return;

    const vectorStore = new VectorStoreService();
    const contextRetriever = new ContextRetriever(vectorStore);

    const semanticContext = await contextRetriever.getSemanticContext(
      userId,
      userQuery,
      {
        realTime: true,
        maxLatency: 500,
        confidenceThreshold: 0.2,
      }
    );

    if (semanticContext.hasRelevantContext) {
      // Format semantic matches into readable transcript text
      const formattedMatches = semanticContext.matches
        .map((match, index) => {
          const timestamp = match.metadata.callStartTime as string;
          const date = new Date(timestamp).toLocaleDateString();
          return `**Conversation ${index + 1} (${date}):**\n${match.content}`;
        })
        .join("\n\n");

      const enrichedContext = {
        semanticMatches: semanticContext.matches.map((match) => ({
          id: match.id,
          content: match.content,
          score: match.score,
          timestamp: match.metadata.callStartTime as string,
        })),
        lastQuery: userQuery,
        confidence: semanticContext.confidence,
        updatedAt: new Date(),
        formattedContext: formattedMatches,
      };

      store.setContext({ dynamicSemanticContext: enrichedContext });

      log.debug(
        "semantic-enrichment",
        `Enriched context for userId ${userId} with ${
          semanticContext.matches.length
        } matches (confidence: ${semanticContext.confidence.toFixed(2)})`
      );
    }
  } catch (error) {
    log.warn(
      "semantic-enrichment-error",
      `Failed to enrich semantic context: ${error}`
    );
  }
}

/****************************************************
 Vector Store Integration - Context Retrieval (For Start of  Conversation)
****************************************************/
async function getHistoricalContext(
  userId: string,
  log: ReturnType<typeof getMakeLogger>
) {
  try {
    const vectorStore = new VectorStoreService();
    const contextRetriever = new ContextRetriever(vectorStore);

    const userHistory = await contextRetriever.getConversationStartContext(
      userId
    );
    const formattedContext =
      contextRetriever.formatContextForAgent(userHistory);

    log.debug(
      "historical-context",
      `Retrieved historical context for userId ${userId}: ${userHistory.totalConversations} conversations`
    );

    return {
      userHistory,
      hasHistory: userHistory.totalConversations > 0,
      lastCallDate: userHistory.lastCallDate,
      commonTopics: userHistory.commonTopics,
      formattedContext,
    };
  } catch (error) {
    log.warn(
      "historical-context-error",
      `Failed to retrieve historical context for userId ${userId}: ${error}`
    );

    // Return empty context on error to ensure calls still work
    return {
      userHistory: {
        recentSummaries: [],
        totalConversations: 0,
        commonTopics: [],
      },
      hasHistory: false,
      commonTopics: [],
      formattedContext: "No previous conversation history available.",
    };
  }
}

/****************************************************
 Vector Store Integration - Transcript Storage
****************************************************/
async function storeTranscriptInVectorDB(
  store: SessionStore,
  log: ReturnType<typeof getMakeLogger>
): Promise<void> {
  try {
    const vectorStore = new VectorStoreService();
    const turns = store.turns.list();

    // Skip if no meaningful conversation occurred
    if (turns.length === 0) {
      log.debug(
        "vector-transcript",
        "No turns to store - skipping transcript storage"
      );
      return;
    }

    // Extract conversation metadata from store context
    const context = store.context;
    const participantPhone = context?.call?.participantPhone || "";

    // Extract clean userId from user context, fallback to resolving from phone if needed
    const userId = context?.user
      ? extractCleanUserId(context.user)
      : participantPhone
      ? resolveUserId(participantPhone)
      : default_user;

    const conversationMetadata = {
      callSid: store.callSid,
      userId,
      participantPhone,
      callStartTime: context?.call?.startedAt || new Date().toISOString(),
      callEndTime: new Date().toISOString(),
      callDirection: context?.call?.direction || "inbound",
      callStatus: "completed",
      topics: context?.summary?.topics || [],
      turnCount: turns.length,
      userCity: context?.user?.traits?.city,
      userState: context?.user?.traits?.state,
      hasOrderHistory: !!(
        context?.user && Object.keys(context.user).length > 0
      ),
    };

    const result = await vectorStore.storeTranscript(
      store.callSid,
      turns,
      conversationMetadata
    );

    if (result.success) {
      log.info(
        "vector-transcript-stored",
        `Transcript stored: ${result.documentIds.length} chunks in ${result.metrics?.processingTime}ms`
      );
    } else {
      log.warn(
        "vector-transcript-failed",
        `Failed to store transcript: ${result.error}`
      );
    }
  } catch (error) {
    log.error(
      "vector-transcript-error",
      `Error storing transcript in vector DB: ${error}`
    );
  }
}

export const completionServerRoutes = router;
