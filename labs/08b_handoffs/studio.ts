import "dotenv/config";
import * as z from "zod";
import { AIMessage, createAgent, initChatModel, tool, ToolMessage, type ToolRuntime } from "langchain";
import {
  Command,
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import { getOrderStatus, searchPolicy, trackShipment } from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const AGENTS = ["order_agent", "billing_agent"] as const;

const HandoffState = new StateSchema({
  messages: MessagesValue,
  activeAgent: z.enum(AGENTS).default("order_agent"),
});

const transferToBilling = tool(
  async (_, runtime: ToolRuntime<typeof HandoffState.State>) => {
    const lastAiMessage = [...runtime.state.messages].reverse().find(AIMessage.isInstance);
    const transferMessage = new ToolMessage({
      content: "billing_agent이(가) 이어받았습니다. 고객의 마지막 질문을 도구로 확인해 바로 답하세요.",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "billing_agent",
      update: { activeAgent: "billing_agent", messages: [lastAiMessage!, transferMessage] },
      graph: Command.PARENT,
    });
  },
  {
    name: "transfer_to_billing",
    description: "환불 · 결제 · 보상 문의를 결제 · 환불 상담원에게 넘긴다.",
    schema: z.object({}),
  },
);

const transferToOrder = tool(
  async (_, runtime: ToolRuntime<typeof HandoffState.State>) => {
    const lastAiMessage = [...runtime.state.messages].reverse().find(AIMessage.isInstance);
    const transferMessage = new ToolMessage({
      content: "order_agent이(가) 이어받았습니다. 고객의 마지막 질문을 도구로 확인해 바로 답하세요.",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "order_agent",
      update: { activeAgent: "order_agent", messages: [lastAiMessage!, transferMessage] },
      graph: Command.PARENT,
    });
  },
  {
    name: "transfer_to_order",
    description: "주문 상태 · 배송 위치 문의를 주문 · 배송 상담원에게 넘긴다.",
    schema: z.object({}),
  },
);

const orderAgent = createAgent({
  name: "order_agent",
  model,
  tools: [getOrderStatus, trackShipment, transferToBilling],
  systemPrompt:
    "너는 스마트몰 주문 · 배송 상담원이야. 주문 상태와 배송 위치를 도구로 확인해 한국어로 답해. " +
    "환불 · 결제 · 보상 질문이면 직접 답하지 말고 transfer_to_billing으로 넘겨. " +
    "넘겨받은 대화라면 고객의 마지막 질문에 바로 답해.",
});

const billingAgent = createAgent({
  name: "billing_agent",
  model,
  tools: [getOrderStatus, searchPolicy, transferToOrder],
  systemPrompt:
    "너는 스마트몰 결제 · 환불 상담원이야. 결제 금액과 환불 · 보상 정책을 도구로 확인해 한국어로 답해. " +
    "배송 위치 질문이면 직접 답하지 말고 transfer_to_order로 넘겨. " +
    "넘겨받은 대화라면 고객의 마지막 질문에 바로 답해.",
});

const callOrderAgent: GraphNode<typeof HandoffState> = async (state) => orderAgent.invoke(state);
const callBillingAgent: GraphNode<typeof HandoffState> = async (state) => billingAgent.invoke(state);

const afterAgent = (state: typeof HandoffState.State) => {
  const last = state.messages.at(-1);
  if (last && AIMessage.isInstance(last) && !last.tool_calls?.length) return END;
  return state.activeAgent;
};

export const graph = (new StateGraph(HandoffState)
  .addNode("order_agent", callOrderAgent, { ends: [...AGENTS] })
  .addNode("billing_agent", callBillingAgent, { ends: [...AGENTS] })
  .addConditionalEdges(START, (state) => state.activeAgent, [...AGENTS])
  .addConditionalEdges("order_agent", afterAgent, [...AGENTS, END])
  .addConditionalEdges("billing_agent", afterAgent, [...AGENTS, END])
  .compile());
