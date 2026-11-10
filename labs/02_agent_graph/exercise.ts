// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 02 · 가장 작은 에이전트 그래프
// 실행: npx tsx labs/02_agent_graph/exercise.ts
import "dotenv/config";
import * as z from "zod";
import { AIMessage, initChatModel, tool, type BaseMessage } from "langchain";
import {
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
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

// State: 그래프가 실행되는 동안 노드끼리 주고받는 값 (여기서는 대화 메시지 목록)
const State = new StateSchema({
  messages: MessagesValue,
});

const model = await initChatModel(MODEL, { useResponsesApi: true });
const modelWithTools = model.bindTools(tools);

const agent: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    {
      role: "system",
      content:
        "너는 스마트몰 고객지원 상담원이야. 필요하면 도구를 써서 한국어로 친절하게 답해.",
    },
    ...state.messages,
  ]);
  return { messages: [response] }; // 바꿀 값만 돌려준다 (메시지는 목록에 추가된다)
};

// TODO 1: START → agent ⇄ tools → END 그래프를 조립하세요 (toolsCondition으로 분기)
// ✏️ 여기에 코드를 작성하세요

// 같은 질문을 세 가지 방식으로 실행해, 결과가 화면에 나오는 방식을 비교한다
const QUESTION =
  "주문 A100 어디쯤 왔어요? 늦어지면 어떻게 되는지도 알려 주세요.";
const input = { messages: [{ role: "user", content: QUESTION }] };
console.log(`👤 ${QUESTION}`);

// ─── 1. invoke: 다 끝날 때까지 화면에 아무것도 나오지 않는다 ───
const result = await graph.invoke(input);
console.log(result.messages[result.messages.length - 1].text);

// ─── 2. stream (updates): 노드가 하나 끝날 때마다 진행 상황을 보여 준다 ───
console.log("\n=== 2. stream — updates (진행 상황) ===");

// TODO 2: streamMode "updates"로 실행하며, 각 노드가 바꾼 내용(새로 추가한 메시지)을 출력하세요
//   step은 { 노드 이름: 그 노드가 바꾼 값 } 모양이다
// ✏️ 여기에 코드를 작성하세요

// ─── 3. stream (messages): 답변을 토큰 단위로 바로바로 보여 준다 ───
console.log("\n=== 3. stream — messages (토큰) ===");

// TODO 3: streamMode "messages"로 실행하며, agent 노드의 토큰을 줄바꿈 없이 출력하세요
//   chunk는 [토큰, 메타데이터] 모양이다
// ✏️ 여기에 코드를 작성하세요
console.log();

// 그래프 구조 그리기 → 출력된 텍스트를 https://mermaid.live 에 붙여 넣는다
const drawable = await graph.getGraphAsync();
console.log("\n" + drawable.drawMermaid());
