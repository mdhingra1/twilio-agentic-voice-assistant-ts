import { readFileSync } from "fs";
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/index.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { AgentResolver } from "../../completion-server/agent-resolver/index.js";
import type { SessionStore } from "../../completion-server/session-store/index.js";
import { getMakeLogger } from "../../lib/logger.js";
import { interpolateTemplate } from "../../lib/template.js";
import { OPENAI_API_KEY } from "../../shared/env.js";
import type { CallSummary } from "./types.js";
import { VectorStoreService } from "../../services/vector-store/index.js";
import { ContextRetriever } from "../../services/vector-store/context-retriever.js";

const __dirname = dirname(fileURLToPath(import.meta.url)); // this directory

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const instructionsTemplate = readFileSync(
  join(__dirname, "instructions.md"),
  "utf-8"
);

const topics_list = readFileSync(join(__dirname, "topics_list.csv"), "utf-8");

interface SummarizationServiceConfig {
  frequency: number;
}

export class SummarizationService {
  log: ReturnType<typeof getMakeLogger>;
  private vectorStore: VectorStoreService;

  // Phone to user mapping - in production this would come from a database
  private phoneToUser: Record<string, string> = {
    "+12092421066": "f9708bce",
    "+17783220513": "a67ef6a1",
  };
  private defaultUser = "f9708bce";

  constructor(
    private store: SessionStore,
    private agent: AgentResolver,
    private config: SummarizationServiceConfig
  ) {
    this.log = getMakeLogger(store.callSid);
    this.vectorStore = new VectorStoreService();
  }

  private resolveUserIdFromPhone(participantPhone: string): string {
    return this.phoneToUser[participantPhone] || this.defaultUser;
  }

  private extractCleanUserId(user: any): string {
    if (!user?.user_id) return this.defaultUser;

    const rawUserId = user.user_id;
    if (typeof rawUserId === "string" && rawUserId.startsWith("user_id:")) {
      return rawUserId.replace("user_id:", "");
    }
    return rawUserId;
  }

  private timeout: NodeJS.Timeout | undefined;
  start = () => {
    if (this.timeout) throw Error("The Summary loop is already started.");
    this.timeout = setInterval(this.execute, this.config.frequency);
  };

  stop = () => clearInterval(this.timeout);

  execute = async () => {
    const transcript = this.getTranscript();
    const instructions = interpolateTemplate(instructionsTemplate, {
      ...this.store.context,
      topics_list,
      transcript,
    });

    let completion: ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: instructions }],
        response_format: { type: "json_object" },
        stream: false,
      });
    } catch (error) {
      this.log.error(
        "summary-bot",
        "Summary Bot competion request failed",
        error
      );
      return;
    }

    const choice = completion.choices[0];
    const content = choice.message.content;
    if (!content) {
      const msg = "Summary Bot returned no content from completion";
      this.log.error(msg);
      return;
    }

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const msg =
        "Summary Bot has no tools but LLM is attempting to execute fns";
      this.log.error(msg);
      return;
    }

    if (choice.finish_reason === "stop") {
      let result: CallSummary;
      try {
        result = JSON.parse(content) as CallSummary;
        if (typeof result !== "object") throw "";
      } catch (error) {
        this.log.error(
          "summary-bot",
          "execute LLM responded with a non-JSON format",
          content
        );
        return;
      }

      const prev = this.store.context?.summary ?? ({} as CallSummary);

      const summary: CallSummary = {
        ...prev,
        ...result,
        topics: [
          ...new Set([...(prev?.topics ?? []), ...(result?.topics ?? [])]),
        ],
      };

      this.store.setContext({ summary });

      // Store summary in vector database
      await this.storeSummaryInVectorDB(summary);

      // Update context with topic-specific historical information
      await this.updateTopicContext(summary);
    }
  };

  private async storeSummaryInVectorDB(summary: CallSummary): Promise<void> {
    try {
      // Extract clean userId from user context, fallback to resolving from phone if needed
      const userId = this.store.context?.user
        ? this.extractCleanUserId(this.store.context.user)
        : this.resolveUserIdFromPhone(
            this.store.context?.call?.participantPhone || ""
          );

      const participantPhone = this.store.context?.call?.participantPhone || "";

      const conversationMetadata = {
        callSid: this.store.callSid,
        userId,
        participantPhone,
        callStartTime:
          this.store.context?.call?.startedAt || new Date().toISOString(),
        callDirection: this.store.context?.call?.direction || "inbound",
        callStatus: this.store.context?.call?.status || "in-progress",
        topics: summary.topics || [],
        userCity: this.store.context?.user?.traits?.city,
        userState: this.store.context?.user?.traits?.state,
        hasOrderHistory: !!(
          this.store.context?.user &&
          Object.keys(this.store.context.user).length > 0
        ),
      };

      const result = await this.vectorStore.updateSummary(
        this.store.callSid,
        summary,
        conversationMetadata
      );

      if (result.success) {
        this.log.debug(
          "vector-summary-stored",
          `Summary stored in vector DB (${result.metrics?.processingTime}ms)`
        );
      } else {
        this.log.warn(
          "vector-summary-failed",
          `Failed to store summary in vector DB: ${result.error}`
        );
      }
    } catch (error) {
      this.log.error(
        "vector-summary-error",
        `Error storing summary in vector DB: ${error}`
      );
    }
  }

  private async updateTopicContext(summary: CallSummary): Promise<void> {
    try {
      // Only update topic context if there are meaningful topics
      if (!summary.topics || summary.topics.length === 0) {
        return;
      }

      const contextRetriever = new ContextRetriever(this.vectorStore);
      const participantPhone = this.store.context?.call?.participantPhone || "";

      if (!participantPhone) {
        this.log.warn(
          "topic-context",
          "No participant phone found for topic context update"
        );
        return;
      }

      // Extract clean userId from user context, fallback to resolving from phone if needed
      const userId = this.store.context?.user
        ? this.extractCleanUserId(this.store.context.user)
        : this.resolveUserIdFromPhone(participantPhone);

      // Get topic-specific context
      const topicContext = await contextRetriever.getTopicSpecificContext(
        userId,
        summary.topics
      );

      // Update the historical context in the store if we found relevant information
      if (topicContext.relevantConversations.length > 0) {
        const currentHistoricalContext = this.store.context?.historicalContext;
        const formattedTopicContext =
          contextRetriever.formatContextForAgent(topicContext);

        // Enhance the existing historical context with topic-specific information
        const enhancedContext = {
          userHistory: currentHistoricalContext?.userHistory || {
            recentSummaries: [],
            totalConversations: 0,
            commonTopics: [],
          },
          hasHistory: currentHistoricalContext?.hasHistory || false,
          lastCallDate: currentHistoricalContext?.lastCallDate,
          commonTopics: currentHistoricalContext?.commonTopics || [],
          formattedContext: currentHistoricalContext?.formattedContext || "",
          topicSpecificContext: formattedTopicContext,
          relatedTopics: topicContext.relatedTopics,
        };

        this.store.setContext({
          historicalContext: enhancedContext,
        });

        this.log.debug(
          "topic-context-updated",
          `Updated context with ${
            topicContext.relevantConversations.length
          } topic-relevant conversations for topics: ${summary.topics.join(
            ", "
          )}`
        );
      }
    } catch (error) {
      this.log.error(
        "topic-context-error",
        `Error updating topic context: ${error}`
      );
    }
  }

  private getTranscript = () =>
    this.store.turns
      .list()
      .map((turn) => {
        if (turn.role === "bot") {
          if (turn.origin === "filler") return;
          if (turn.type === "tool") return;

          return `[${turn.role.toUpperCase()}]: ${turn.content}`;
        }

        if (turn.role === "human") {
          return `[${turn.role.toUpperCase()}]: ${turn.content}`;
        }

        if (turn.role === "system") {
          return false;
        }
      })
      .filter((line) => !!line)
      .join("\n\n");
}
