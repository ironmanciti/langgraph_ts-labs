// 정답 코드 — 02 · 가장 작은 에이전트 그래프
// 실행: npx tsx labs/02_agent_graph/solution.ts
import "dotenv/config";
import * as z from "zod";
import { AIMessage, initChatModel, tool, type BaseMessage } from "langchain"; /// initChatModel: 모델 이름으로 채팅 모델 객체를 만든다
import {
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { findOrder, trackParcel } from "../../src/data/orders.ts"; /// 가상 주문 데이터 · 택배 위치 조회

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

/// 주문 상태 조회 도구
const getOrderStatus = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId); /// 없으면 undefined
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta})`;
  },
  {
    name: "get_order_status",
    description: "주문번호로 주문 상태를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

/// 배송 위치 조회 도구
const trackShipment = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId);
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    if (!order.trackingNo) return "아직 출고 전이라 송장번호가 없습니다."; /// 송장번호가 비어 있으면
    return trackParcel(order.trackingNo); /// 송장번호로 택배 위치를 찾아 문장으로 돌려준다
  },
  {
    name: "track_shipment",
    description: "주문의 배송 위치를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

/// 모델에게 알려 줄 도구와 ToolNode가 실행할 도구는 같은 목록을 쓴다
const tools = [getOrderStatus, trackShipment];

// State: 그래프가 실행되는 동안 노드끼리 주고받는 값 (여기서는 대화 메시지 목록)
const State = new StateSchema({
  /// MessagesValue: 노드가 돌려준 메시지를 덮어쓰지 않고 목록 뒤에 추가해 준다
  messages: MessagesValue,
});

const model = await initChatModel(MODEL, { useResponsesApi: true }); /// 모델 객체 만들기
const modelWithTools = model.bindTools(tools);

/// GraphNode<typeof State>: "이 State를 받는 그래프 노드"라는 타입 표시
const agent: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    {
      role: "system",
      content:
        "너는 스마트몰 고객지원 상담원이야. 필요하면 도구를 써서 한국어로 친절하게 답해.",
    },
    /// ...: 배열을 펼쳐서 넣는다 → 시스템 메시지 뒤에 지금까지의 대화가 이어진다
    ...state.messages,
  ]);
  return { messages: [response] }; // 바꿀 값만 돌려준다 (메시지는 목록에 추가된다)
};

// TODO 1: START → agent ⇄ tools → END 그래프를 조립하세요 (toolsCondition으로 분기)
//#region 정답
/// 메서드를 점(.)으로 이어 붙이며 그래프를 만든다 (체이닝)
const graph = new StateGraph(State)
  .addNode("agent", agent) // LLM 노드
  .addNode("tools", new ToolNode(tools)) // 도구 실행 노드
  .addEdge(START, "agent") // 시작
  .addConditionalEdges("agent", toolsCondition, ["tools", END]) // tool_calls가 있으면 tools, 없으면 END
  .addEdge("tools", "agent") // 도구 결과를 들고 다시 agent로
  /// compile: 조립한 설계도를 실행할 수 있는 그래프로 만든다
  .compile();
//#endregion

// 같은 질문을 세 가지 방식으로 실행해, 결과가 화면에 나오는 방식을 비교한다
const QUESTION =
  "주문 A100 어디쯤 왔어요? 늦어지면 어떻게 되는지도 알려 주세요.";
const input = { messages: [{ role: "user", content: QUESTION }] };
console.log(`👤 ${QUESTION}`);

// ─── 1. invoke: 다 끝날 때까지 화면에 아무것도 나오지 않는다 ───
const result = await graph.invoke(input); /// agent ⇄ tools가 모두 끝나야 돌아온다
console.log(result.messages[result.messages.length - 1].text); /// 마지막 메시지 = 최종 답변

// ─── 2. stream (updates): 노드가 하나 끝날 때마다 진행 상황을 보여 준다 ───
console.log("\n=== 2. stream — updates (진행 상황) ===");

// TODO 2: streamMode "updates"로 실행하며, 각 노드가 바꾼 내용(새로 추가한 메시지)을 출력하세요
//   step은 { 노드 이름: 그 노드가 바꾼 값 } 모양이다
//#region 정답
/// stream(입력, 옵션) — "updates"는 노드 하나가 끝날 때마다 그 노드가 바꾼 값을 보내 준다
const updates = await graph.stream(input, { streamMode: "updates" });
/// for await: 결과 조각이 도착할 때마다 한 번씩 반복한다
for await (const step of updates) {
  /// Object.entries: { 노드 이름: 바꾼 값 }을 [노드 이름, 바꾼 값] 쌍으로 꺼낸다 — 예: agent → tools → agent
  for (const [nodeName, update] of Object.entries(step)) {
    /// update.messages에는 전체 대화가 아니라 이 노드가 새로 추가한 메시지만 들어 있다
    /// as BaseMessage[]: 타입이 "넣을 수 있는 모든 모양"으로 넓게 잡혀 있어, 실제 모양(메시지 배열)을 알려 준다
    const messages = (update.messages ?? []) as BaseMessage[];
    for (const message of messages) {
      /// 도구 요청 메시지는 text가 비어 있으므로, 요청한 도구 이름과 인자를 대신 보여 준다
      const toolCalls = AIMessage.isInstance(message)
        ? message.tool_calls ?? []
        : [];
      const content = toolCalls.length
        ? toolCalls
            .map((call) => `${call.name}(${JSON.stringify(call.args)})`)
            .join(", ")
        : message.text;
      console.log(`[${nodeName}] ${content}`);
    }
  }
}
//#endregion

// ─── 3. stream (messages): 답변을 토큰 단위로 바로바로 보여 준다 ───
console.log("\n=== 3. stream — messages (토큰) ===");

// TODO 3: streamMode "messages"로 실행하며, agent 노드의 토큰을 줄바꿈 없이 출력하세요
//   chunk는 [토큰, 메타데이터] 모양이다
//#region 정답
/// "messages"는 모델이 만드는 글자(토큰)를 생기는 즉시 보내 준다
const tokens = await graph.stream(input, { streamMode: "messages" });
/// [chunk, metadata]: 토큰 조각과 "어느 노드에서 나왔는지" 정보를 함께 받는다 (구조 분해)
for await (const [chunk, metadata] of tokens) {
  /// agent 노드의 토큰만 출력한다 (tools 노드의 도구 결과는 건너뛴다)
  if (metadata.langgraph_node === "agent" && chunk.text) {
    process.stdout.write(chunk.text); /// 줄바꿈 없이 이어서 출력
  }
}
//#endregion
console.log();

// 그래프 구조 그리기 → 출력된 텍스트를 https://mermaid.live 에 붙여 넣는다
const drawable = await graph.getGraphAsync(); /// 그래프의 노드 · 엣지 정보를 가져온다
/// drawMermaid: 그래프를 Mermaid(그림 그리는 문법) 텍스트로 바꾼다
console.log("\n" + drawable.drawMermaid());
