import type {
  UserHistoryContext,
  TopicContext,
  DetailedContext,
  ConversationMatch,
  ContextRetrievalOptions,
} from "./types.js";
import { VectorStoreService } from "./index.js";
import { generateEmbedding } from "./embeddings.js";
import { getMakeLogger } from "../../lib/logger.js";

export class ContextRetriever {
  private log: ReturnType<typeof getMakeLogger>;

  constructor(private vectorStore: VectorStoreService) {
    this.log = getMakeLogger("context-retriever");
  }

  /****************************************************
   Conversation Start Context
  ****************************************************/
  async getConversationStartContext(
    participantPhone: string
  ): Promise<UserHistoryContext> {
    const startTime = Date.now();

    try {
      // Get recent summaries for quick context
      const result = await this.vectorStore.getRelevantContext(
        participantPhone,
        "Recent customer interactions and conversation history",
        {
          topK: 5,
          contentTypes: ["summary"],
          maxDays: 30,
          minScore: 0.3, // Lower threshold since we are not really looking for specific topics here
        }
      );

      if (!result.success) {
        this.log.warn(
          "conversation-start-context-failed",
          `Failed to get conversation start context: ${result.error}`
        );
        return this.createEmptyUserHistoryContext();
      }

      // Extract common topics from last 5 summaries
      const topicCounts = new Map<string, number>();
      result.matches.forEach((match) => {
        if (match.metadata.topics) {
          match.metadata.topics.forEach((topic: string) => {
            topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
          });
        }
      });

      // Sort topics by frequency and take top 5
      const commonTopics = Array.from(topicCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic]) => topic);

      // Find last call date, TODO: let's sort  by callStartTime in the vector store
      const lastCallDate =
        result.matches.length > 0
          ? result.matches[0].metadata.callStartTime
          : undefined;

      const processingTime = Date.now() - startTime;
      this.log.debug(
        "conversation-start-context",
        `Retrieved context for ${participantPhone} with ${result.matches.length} summaries in ${processingTime}ms`
      );

      return {
        recentSummaries: result.matches,
        totalConversations: result.matches.length,
        lastCallDate,
        commonTopics,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log.error(
        "conversation-start-context-error",
        `Error getting conversation start context after ${processingTime}ms: ${error}`
      );
      return this.createEmptyUserHistoryContext();
    }
  }

  /****************************************************
   Topic-Specific Context
  ****************************************************/
  async getTopicSpecificContext(
    participantPhone: string,
    topics: string[]
  ): Promise<TopicContext> {
    const startTime = Date.now();

    try {
      if (topics.length === 0) {
        return this.createEmptyTopicContext("general");
      }

      const primaryTopic = topics[0];

      // Create query combining topic keywords
      const topicQuery = `Customer conversation about ${topics.join(
        " and "
      )} topics`;

      // Get both summaries and relevant transcript segments
      const result = await this.vectorStore.getRelevantContext(
        participantPhone,
        topicQuery,
        {
          topK: 8,
          contentTypes: ["summary", "transcript"],
          maxDays: 90, // Longer lookback for topic-specific context
          minScore: 0.4,
        }
      );

      if (!result.success) {
        this.log.warn(
          "topic-context-failed",
          `Failed to get topic-specific context for ${topics.join(", ")}: ${
            result.error
          }`
        );
        return this.createEmptyTopicContext(primaryTopic);
      }

      // Filter and rank by topic relevance
      const topicRelevantMatches = this.filterAndRankByTopicRelevance(
        result.matches,
        topics
      );

      // Extract related topics from matches
      const relatedTopics = this.extractRelatedTopics(
        topicRelevantMatches,
        topics
      );

      const processingTime = Date.now() - startTime;
      this.log.debug(
        "topic-specific-context",
        `Retrieved ${
          topicRelevantMatches.length
        } topic-relevant matches for ${topics.join(
          ", "
        )} in ${processingTime}ms`
      );

      return {
        relevantConversations: topicRelevantMatches,
        topic: primaryTopic,
        relatedTopics,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log.error(
        "topic-context-error",
        `Error getting topic-specific context after ${processingTime}ms: ${error}`
      );
      return this.createEmptyTopicContext(topics[0] || "general");
    }
  }

  /****************************************************
   Detailed Context for Complex Issues -- TODO, actually use this
  ****************************************************/
  async getDetailedContext(
    participantPhone: string,
    query: string
  ): Promise<DetailedContext> {
    const startTime = Date.now();

    try {
      // Get detailed context from transcripts for specific issue resolution
      const result = await this.vectorStore.getRelevantContext(
        participantPhone,
        query,
        {
          topK: 10,
          contentTypes: ["transcript", "summary"],
          maxDays: 180, // Longer lookback for complex issues
          minScore: 0.4,
        }
      );

      if (!result.success) {
        this.log.warn(
          "detailed-context-failed",
          `Failed to get detailed context for query: ${result.error}`
        );
        return this.createEmptyDetailedContext(query);
      }

      // Separate transcripts and summaries
      const transcriptSegments = result.matches.filter(
        (match) => match.metadata.contentType === "transcript"
      );
      const summaries = result.matches.filter(
        (match) => match.metadata.contentType === "summary"
      );

      // Sort by relevance score
      transcriptSegments.sort((a, b) => b.score - a.score);
      summaries.sort((a, b) => b.score - a.score);

      const processingTime = Date.now() - startTime;
      this.log.debug(
        "detailed-context",
        `Retrieved detailed context with ${transcriptSegments.length} transcript segments and ${summaries.length} summaries in ${processingTime}ms`
      );

      return {
        transcriptSegments,
        summaries,
        query,
        totalMatches: result.matches.length,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log.error(
        "detailed-context-error",
        `Error getting detailed context after ${processingTime}ms: ${error}`
      );
      return this.createEmptyDetailedContext(query);
    }
  }

  /****************************************************
   Utility Methods
  ****************************************************/
  private filterAndRankByTopicRelevance(
    matches: ConversationMatch[],
    targetTopics: string[]
  ): ConversationMatch[] {
    return matches
      .map((match) => {
        // Calculate topic relevance boost
        const matchTopics = match.metadata.topics || [];
        const topicOverlap = targetTopics.filter((topic) =>
          matchTopics.some(
            (matchTopic) =>
              matchTopic.toLowerCase().includes(topic.toLowerCase()) ||
              topic.toLowerCase().includes(matchTopic.toLowerCase())
          )
        ).length;

        // Boost score based on topic overlap
        const topicBoost = (topicOverlap / targetTopics.length) * 0.2;
        const adjustedScore = Math.min(match.score + topicBoost, 1.0);

        return {
          ...match,
          score: adjustedScore,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private extractRelatedTopics(
    matches: ConversationMatch[],
    excludeTopics: string[]
  ): string[] {
    const topicCounts = new Map<string, number>();

    matches.forEach((match) => {
      if (match.metadata.topics) {
        match.metadata.topics.forEach((topic: string) => {
          const topicLower = topic.toLowerCase();
          if (
            !excludeTopics.some(
              (excluded) => excluded.toLowerCase() === topicLower
            )
          ) {
            topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
          }
        });
      }
    });

    return Array.from(topicCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([topic]) => topic);
  }

  /****************************************************
   Empty Context Creators
  ****************************************************/
  private createEmptyUserHistoryContext(): UserHistoryContext {
    return {
      recentSummaries: [],
      totalConversations: 0,
      commonTopics: [],
    };
  }

  private createEmptyTopicContext(topic: string): TopicContext {
    return {
      relevantConversations: [],
      topic,
      relatedTopics: [],
    };
  }

  private createEmptyDetailedContext(query: string): DetailedContext {
    return {
      transcriptSegments: [],
      summaries: [],
      query,
      totalMatches: 0,
    };
  }

  /****************************************************
   Context Formatting for Agent
  ****************************************************/
  formatContextForAgent(
    context: UserHistoryContext | TopicContext | DetailedContext
  ): string {
    if ("recentSummaries" in context) {
      // UserHistoryContext
      if (context.recentSummaries.length === 0) {
        return "No previous conversation history found for this customer.";
      }

      const summaries = context.recentSummaries
        .slice(0, 3) // Limit to most recent
        .map((match) => {
          const date = new Date(
            match.metadata.callStartTime
          ).toLocaleDateString();
          const topics =
            match.metadata.topics?.join(", ") || "No specific topics";
          // Include the actual conversation content/summary
          const content = match.content || "No summary available";
          return `• ${date} (Topics: ${topics}): ${content}`;
        })
        .join("\n");

      return `Previous conversations (${context.totalConversations} total):\n${summaries}`;
    } else if ("relevantConversations" in context) {
      // TopicContext
      if (context.relevantConversations.length === 0) {
        return `No previous conversations found about ${context.topic}.`;
      }

      const conversations = context.relevantConversations
        .slice(0, 3)
        .map((match) => {
          const date = new Date(
            match.metadata.callStartTime
          ).toLocaleDateString();
          return `• ${date}: Previous discussion about ${context.topic}`;
        })
        .join("\n");

      return `Previous conversations about ${context.topic}:\n${conversations}`;
    } else {
      // DetailedContext
      if (context.totalMatches === 0) {
        return "No detailed conversation history found for this specific query.";
      }

      const details = [
        ...context.summaries.slice(0, 2),
        ...context.transcriptSegments.slice(0, 2),
      ]
        .sort((a, b) => b.score - a.score)
        .map((match) => {
          const date = new Date(
            match.metadata.callStartTime
          ).toLocaleDateString();
          const type =
            match.metadata.contentType === "summary" ? "Summary" : "Transcript";
          return `• ${date} (${type}): Relevant to current inquiry`;
        })
        .join("\n");

      return `Detailed context for "${context.query}":\n${details}`;
    }
  }
}
