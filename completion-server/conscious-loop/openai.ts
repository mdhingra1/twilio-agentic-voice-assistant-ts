import OpenAI from "openai";
import type { Stream } from "openai/streaming";
import { v4 as uuidV4 } from "uuid";
import type { ToolDefinition, ToolResponse } from "../../agent/types.js";
import { TypedEventEmitter } from "../../lib/events.js";
import log, { getMakeLogger } from "../../lib/logger.js";
import { OPENAI_API_KEY } from "../../shared/env.js";
import type { OpenAIConfig } from "../../shared/openai.js";
import type {
  BotTextTurn,
  BotTextTurnParams,
  BotToolTurn,
  BotToolTurnParams,
  StoreToolCall,
  TurnRecord,
} from "../../shared/session/turns.js";
import type { IAgentResolver } from "../agent-resolver/types.js";
import type { SessionStore } from "../session-store/index.js";
import type { ConversationRelayAdapter } from "../twilio/conversation-relay.js";
import type { ConsciousLoopEvents, IConsciousLoop } from "./types.js";

// --- Add these imports for responses API ---
import type {
  Responses,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
  ResponseOutputMessage,
  ResponseFunctionToolCall,
  Tool as ResponseTool,
  ResponseInputItem,
} from "openai/resources/responses/responses";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const LLM_MAX_RETRY_ATTEMPTS = 3;

export class OpenAIConsciousLoop
    implements
        IConsciousLoop<
            OpenAIConfig,
            ResponseTool[] | undefined,
            ResponseInputItem[]
            >
{
  private log: ReturnType<typeof getMakeLogger>;
  constructor(
      public store: SessionStore,
      public agent: IAgentResolver,
      public relay: ConversationRelayAdapter,
  ) {
    this.log = getMakeLogger(store.callSid);
    this.eventEmitter = new TypedEventEmitter<ConsciousLoopEvents>();

    // the conscious loop can be trigger by certain store events
    this.store.on("tryCompletion", () => {
      if (this.stream) return;
      this.run();
    });
  }

  private stream?: Stream<ResponseStreamEvent>;
  private activeCompletionId: string | undefined; // keeps track of

  run = async (): Promise<undefined | Promise<any>> => {
    this.checkStream();

    this.emit("run.started");
    await this.doCompletion();
    this.emit("run.finished");
  };

  private checkStream = () => {
    // There should only be one completion stream open at a time.
    if (this.stream) {
      this.log.warn(
          "llm",
          "Starting a completion while one is already underway. Previous completion will be aborted.",
      );
      this.abort(); // judgement call: should previous completion be aborted or should the new one be cancelled?
    }
  };

  private doCompletion = async (
      attempt = 0,
  ): Promise<undefined | Promise<any>> => {
    const completionId = uuidV4();
    this.activeCompletionId = completionId;

    this.store.insertParkingLot(); // adds any parking lot items to the store before completion

    const messages = this.getTurns();

    let args: ResponseCreateParamsStreaming | undefined;
    try {
      const tools = this.getTools();
      args = { ...this.getConfig(), input: messages, stream: true, tools };
      // Use the new responses API instead of completions API
      this.stream = await openai.responses.create(args);
    } catch (error) {
      const _args = JSON.stringify({ turns: this.store.turns.list(), ...args });
      this.log.error("llm", "Error attempting completion", error, "\n", _args);
      return this.handleRetry(attempt + 1);
    }

    let botText: BotTextTurn | undefined;
    let botTool: BotToolTurn | undefined;

    let finish_reason: Finish_Reason | null = null;

    // Track message state for streaming text
    let currentMessageId: string | undefined;
    let currentText = "";


    // --- Tool call streaming state ---
    let toolCallArgsMap: Record<string, string> = {};
    let toolCallIndexMap: Record<string, number> = {};

    for await (const event of this.stream) {
      // Uncomment for debugging:
      console.log("Received event:", event.type);
      console.log("Received event:", event);

      switch (event.type) {
        case "response.created":
        case "response.in_progress":
        case "response.queued":
          // These events can be used for logging or progress indication
          break;

        case "response.output_item.added":
          if (event.item.type === "message") {
            // Start of a new assistant message
            currentMessageId = event.item.id;
            currentText = "";
            if (!botText) {
              botText = this.store.turns.addBotText({
                content: "",
                id: event.item.id,
                origin: "llm",
                status: "streaming",
              });
              this.emit("text-chunk", "", false, "");
            }
          } else if (event.item.type === "function_call") {
            // Add new tool call to botTool.tool_calls array
            if (!botTool) {
              botTool = this.store.turns.addBotTool({
                id: event.item.id,
                origin: "llm",
                status: "streaming",
                tool_calls: [],
              });
            }
            const idx = botTool.tool_calls.length;
            botTool.tool_calls.push({
              ...event.item,
              function: {
                name: event.item.name,
                arguments: "",
              },
            } as StoreToolCall);
            toolCallArgsMap[event.item.id] = "";
            toolCallIndexMap[event.item.id] = idx;
            const toolName = event.item.name;
            if (toolName) this.agent.queueFillerPhrase(botTool.id, toolName);
          }
          break;

        case "response.function_call_arguments.delta":
          if (botTool && event.item_id in toolCallIndexMap) {
            toolCallArgsMap[event.item_id] += event.delta;
            const idx = toolCallIndexMap[event.item_id];
            botTool.tool_calls[idx].function.arguments = toolCallArgsMap[event.item_id];
          }
          break;

        case "response.function_call_arguments.done":
          if (botTool && event.item_id in toolCallIndexMap) {
            toolCallArgsMap[event.item_id] = event.arguments;
            const idx = toolCallIndexMap[event.item_id];
            botTool.tool_calls[idx].function.arguments = event.arguments;
          }
          break;

        case "response.output_item.done":
          if (
              event.item.type === "function_call" &&
              botTool &&
              event.item.id in toolCallIndexMap
          ) {
            const idx = toolCallIndexMap[event.item.id];
            botTool.tool_calls[idx].function.arguments = event.item.arguments;
            botTool.tool_calls[idx].function.name = event.item.name;
            // Optionally, mark tool call as complete
            botTool.tool_calls[idx].status = "completed";
            // If all tool calls are complete, set finish_reason
            if (
                botTool.tool_calls.every(
                    (tc) => tc.function.arguments && tc.status === "completed"
                )
            ) {
              botTool.status = "complete";
              finish_reason = "tool_calls";
            }
          }
          // Add tool/function call handling here if needed
          break;

        case "response.output_text.delta":
          if (event.item_id === currentMessageId) {
            currentText += event.delta;
            if (botText) {
              botText.content = currentText;
              this.emit("text-chunk", event.delta, false, botText.content);
            }
          }
          break;

        case "response.output_text.done":
          if (event.item_id === currentMessageId) {
            if (botText) {
              botText.content = event.text;
              botText.status = "complete";
              this.emit("text-chunk", "", true, botText.content);
            }
            finish_reason = "stop";
          }
          break;

        case "response.output_item.added":
          if (event.item.type === "function_call") {
            const toolCall = event.item as ResponseFunctionToolCall;
            if (!botTool) {
              botTool = this.store.turns.addBotTool({
                id: toolCall.id || event.item.id,
                origin: "llm",
                status: "streaming",
                tool_calls: [toolCall as StoreToolCall],
              });
              const toolName = toolCall.name;
              if (toolName) this.agent.queueFillerPhrase(botTool.id, toolName);
            }
          }
          break;

        case "response.completed":
          // finish_reason = "stop";
          break;

          // Add more event types as needed for tool calls, refusals, etc.

        default:
          // ...existing code...
          break;
      }
    }

    /****************************************************
     Handle Completion Finish
     ****************************************************/
    if (finish_reason === "stop") {
      if (!botText) throw Error("finished for 'stop' but no BotText"); // should be unreachable
      botText.status = "complete";
      this.emit("text-chunk", "", true, botText.content);
      return
    }

    if (finish_reason === "tool_calls") {
      console.log("Handling tool calls completion", botTool?.tool_calls);
      if (!botTool) throw Error("finished for tool_calls but no BotTool"); // should be unreachable

      await this.handleToolExecution(botTool);
      console.log("Tool execution completed");
      if (botTool.status === "streaming") botTool.status = "complete";

      if (this.activeCompletionId !== completionId) return; // check to make the stream that started this completion is still the same. if it's not, that means there was an interruption or error. a subsequent completion is not warranted
      this.stream = undefined;
      return this.doCompletion(); // start another completion after tools are resolved
    }

    // todo: add handlers for these situations
    if (finish_reason === "content_filter")
      this.log.warn("llm", `Unusual finish reason ${finish_reason}`);
    if (finish_reason === "function_call")
      this.log.warn("llm", `Unusual finish reason ${finish_reason}`);
    if (finish_reason === "length")
      this.log.warn("llm", `Unusual finish reason ${finish_reason}`);

    // clean up completion
    this.stream = undefined;
  };

  handleToolExecution = async (botTool: BotToolTurn) => {
    const executions = await Promise.all(
        botTool.tool_calls.map(async (tool) => {
          try {
            this.emit("tool.starting", botTool, tool);

            let args: object | undefined;
            try {
              args = JSON.parse(tool.function.arguments);
            } catch (error) {
              log.warn(
                  "llm",
                  `error parsing tool (${tool.function.name}), args: `,
                  tool.function.arguments,
              );
            }

            const result = await this.agent.executeTool(
                botTool.id,
                tool.function.name,
                args,
            );

            return { result, tool };
          } catch (error) {
            this.log.warn("llm", "Error while executing a tool", error);
            const result: ToolResponse = { status: "error", error: "unknown" };
            return { tool, result };
          }
        }),
    );

    if (botTool.status !== "interrupted") {
      for (const { result, tool } of executions) {
        // todo: add abort logic
        this.store.turns.setToolResult(tool.id, result);
        if (result.status === "complete")
          this.emit("tool.complete", botTool, tool, result);
        if (result.status === "error")
          this.emit("tool.error", botTool, tool, result);
      }
    }
  };

  private handleRetry = async (attempt: number) =>
      new Promise((resolve) => {
        this.abort(); // set stream to undefined

        setTimeout(() => {
          if (this.stream) return resolve(null);
          if (attempt > LLM_MAX_RETRY_ATTEMPTS) {
            const message = `LLM completion failed more than max retry attempt`;
            this.log.error(`llm`, message);
            this.relay.end({ reason: "error", message });
            return resolve(null);
          }

          if (attempt > 0)
            this.log.info(`llm`, `Completion retry attempt: ${attempt}`);

          resolve(this.doCompletion(attempt));
        }, 1000);
      });

  /**
   * Aborts and cleans up the existing completion loop
   */
  abort = () => {
    if (this.stream && !this.stream?.controller.signal.aborted)
      this.stream?.controller.abort();

    this.activeCompletionId = undefined;
    this.stream = undefined;
  };

  // translate this app's config schema into OpenAI format
  getConfig = (): OpenAIConfig => {
    const { model } = this.agent.getLLMConfig();
    return { model };
  };

  // translate this app's tool schema into OpenAI format
  getTools = (): ResponseTool[] | undefined => {
    const tools = this.agent
        .getTools()
        .map(this.translateToolSpec)
        .filter((tool) => !!tool);

    return tools.length ? tools : undefined;
  };

  private translateToolSpec = (
      tool: ToolDefinition,
  ): ResponseTool | undefined => {
    if (tool.type === "function" || tool.type === "request") {
      return {
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: true,
      } as ResponseTool;
    }
    log.warn("openai", `unable to translate tool`, JSON.stringify(tool));
  };

  // translate this app's turn schema into OpenAI format
  getTurns = () =>
      [
        this.makeSystemParam(),
        ...this.store.turns
            .list()
            .filter(
                (turn) => (turn.role === "bot" ? turn.origin !== "filler" : true),
            )
            .flatMap(this.translateStoreTurnToLLMParam)
            .filter((msg) => !!msg),
      ] as ResponseInputItem[];

  private makeSystemParam = () => ({
    role: "system",
    content: this.agent.getInstructions()
  });

  /**
   * Converts the store's turn schema to the OpenAI parameter schema required by their responses API
   */
  translateStoreTurnToLLMParam = (
      turn: TurnRecord,
  ): ResponseInputItem | ResponseInputItem[] | null => {
    // DTMF and text bot turns become assistant messages
    if (turn.role === "bot" && turn.type === "dtmf")
      return {
        role: "assistant",
        content: turn.content,
      };
    if (turn.role === "bot" && turn.type === "text")
      return {
        role: "assistant",
        content: turn.content,
      };

    // Human/user turns
    if (turn.role === "human")
      return {
        role: "user",
        content: [{ type: "input_text", text: turn.content }],
        type: "message",
      };
    // System turns
    if (turn.role === "system")
      return {
        role: "system",
        content:turn.content,
      };

    // Tool turns: emit the function call(s) and their result(s)
    if (turn.role === "bot" && turn.type === "tool") {
      // (1) The assistant's function call(s)
      const toolCalls: ResponseInputItem[] = turn.tool_calls.map((tool) => ({
        type: "function_call",
        id: tool.id,
        call_id: tool.call_id,
        name: tool.function.name,
        arguments: tool.function.arguments,
        status: tool.status ?? "completed",
      }));

      // (2) The tool results, as function_call_output
      const toolResults: ResponseInputItem[] = turn.tool_calls
          .filter((tool) => tool.result !== null)
          .map((tool) => ({
            type: "function_call_output",
            call_id: tool.call_id,
            output: (() => {
              try {
                return JSON.stringify(tool.result ?? { status: "error", error: "unknown" });
              } catch {
                return `{"status": "error", "error": "unknown" }`;
              }
            })(),
          }));

      // If any tool.result is null, skip this turn
      if (turn.tool_calls.some((tool) => tool.result === null)) {
        this.log.warn(
            "llm",
            "A Tool Call has null result, which should never happen. This turn will be filtered",
            JSON.stringify({ turn, allTurns: this.store.turns.list() }),
        );
        return null;
      }

      // Return the function call(s) and their output(s) in order
      return [...toolCalls, ...toolResults];
    }

    // Unknown turn type
    this.log.warn(
        "llm",
        "StoreTurn not recognized by LLM translator.",
        JSON.stringify({ turn, allTurns: this.store.turns.list() }),
    );
    return null;
  };

  /****************************************************
   Event Type Casting
   ****************************************************/
  private eventEmitter: TypedEventEmitter<ConsciousLoopEvents>;
  public on: TypedEventEmitter<ConsciousLoopEvents>["on"] = (...args) =>
      this.eventEmitter.on(...args);
  private emit: TypedEventEmitter<ConsciousLoopEvents>["emit"] = (
      event,
      ...args
  ) => this.eventEmitter.emit(event, ...args);
}

type Finish_Reason =
    | "content_filter"
    | "function_call"
    | "length"
    | "stop"
    | "tool_calls";
