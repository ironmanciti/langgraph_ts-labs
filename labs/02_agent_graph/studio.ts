import "dotenv/config";
import * as z from "zod";
import { initChatModel, tool } from "langchain";
import { END, MessagesValue, START, StateGraph, StateSchema, type GraphNode } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { findOrder, trackParcel } from "../../src/data/orders.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const getOrderStatus = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId);
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta})`;
  },
  {
    name: "get_order_status",
    description: "주문번호로 주문 상태를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

const trackShipment = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId);
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    if (!order.trackingNo) return "아직 출고 전이라 송장번호가 없습니다.";
    return trackParcel(order.trackingNo);
  },
  {
    name: "track_shipment",
    description: "주문의 배송 위치를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

const tools = [getOrderStatus, trackShipment];

const State = new StateSchema({
  messages: MessagesValue,
});

const model = await initChatModel(MODEL, { useResponsesApi: true });
const modelWithTools = model.bindTools(tools);

const agent: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    { role: "system", content: "너는 스마트몰 고객지원 상담원이야. 필요하면 도구를 써서 한국어로 친절하게 답해." },
    ...state.messages,
  ]);
  return { messages: [response] };
};

export const graph = (new StateGraph(State)
  .addNode("agent", agent)
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END])
  .addEdge("tools", "agent")
  .compile());
