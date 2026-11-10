// 정답 코드 — 08b · Handoffs: 상담원끼리 대화를 넘긴다 (넘겨받은 상담원이 고객과 직접 대화)
// 실행: npx tsx labs/08b_handoffs/solution.ts
import "dotenv/config";
import * as z from "zod";
import {
  AIMessage,
  createAgent,
  initChatModel,
  tool,
  ToolMessage,
  type ToolRuntime,
} from "langchain";
import {
  Command, /// "State 변경 + 다음에 갈 노드"를 함께 돌려줄 때 쓴다
  END,
  MemorySaver, /// 대화 상태를 thread별로 저장하는 체크포인터
  MessagesValue, /// 메시지 목록용 State 항목
  START,
  StateGraph, /// 노드와 엣지로 그래프를 조립하는 클래스
  StateSchema, /// State의 모양을 정한다
  type GraphNode, /// 노드 함수의 타입
} from "@langchain/langgraph";
/// 08b~08d가 함께 쓰는 상담 도구
import {
  getOrderStatus,
  searchPolicy,
  trackShipment,
} from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const AGENTS = ["order_agent", "billing_agent"] as const; /// 노드 이름 목록 (as const: 글자 그대로의 타입으로 고정)

/// State: 메시지 + 지금 고객과 대화 중인 상담원
const HandoffState = new StateSchema({
  messages: MessagesValue,
  activeAgent: z.enum(AGENTS).default("order_agent"), /// 처음에는 주문 · 배송 상담원이 받는다
});

// TODO 1: 대화를 다른 상담원에게 넘기는 도구 2개를 만드세요 (transfer_to_billing, transfer_to_order)
//   Command로 ① 부모 그래프(graph: Command.PARENT)의 상대 상담원 노드로 이동(goto)하고
//   ② activeAgent를 그 상담원으로 바꾸고
//   ③ 넘기기 직전 AI 메시지 + 도구 결과(ToolMessage)를 messages에 남깁니다
//#region 정답
const transferToBilling = tool(
  /// 입력값이 없어서 첫 인자는 _ (쓰지 않는다는 표시), 두 번째 runtime으로 State와 toolCallId를 읽는다
  async (_, runtime: ToolRuntime<typeof HandoffState.State>) => {
    /// 이 도구를 부른 AI 메시지 (tool_calls가 들어 있다) — 다음 상담원이 대화 흐름을 이어 볼 수 있게 함께 넘긴다
    ///   [...배열]로 복사한 뒤 reverse(뒤집기) → find로 가장 마지막 AI 메시지를 찾는다
    const lastAiMessage = [...runtime.state.messages]
      .reverse()
      .find(AIMessage.isInstance);
    /// 도구 호출에는 반드시 같은 toolCallId의 결과 메시지가 짝으로 있어야 한다
    ///   content는 넘겨받은 상담원이 읽는다 → 무엇을 할지 분명히 적는다
    const transferMessage = new ToolMessage({
      content:
        "billing_agent이(가) 이어받았습니다. 고객의 마지막 질문을 도구로 확인해 바로 답하세요.",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "billing_agent", /// 다음에 실행할 노드
      /// activeAgent: 이제 billing_agent가 고객을 맡는다고 State에 기록한다
      /// messages: [도구를 부른 AI 메시지, 그 도구의 결과 메시지]를 부모 그래프 대화에 남긴다
      update: {
        activeAgent: "billing_agent",
        messages: [lastAiMessage!, transferMessage],
      },
      graph: Command.PARENT, /// 에이전트 안이 아니라 바깥(부모) 그래프에서 이동한다
    });
  },
  {
    name: "transfer_to_billing", /// 모델이 부를 때 쓰는 이름
    description: "환불 · 결제 · 보상 문의를 결제 · 환불 상담원에게 넘긴다.",
    schema: z.object({}), /// 모델에게서 받을 인자 없음 (빈 객체)
  },
);

/// 주문 · 배송 상담원(order_agent)에게 넘기는 도구
const transferToOrder = tool(
  async (_, runtime: ToolRuntime<typeof HandoffState.State>) => {
    const lastAiMessage = [...runtime.state.messages]
      .reverse()
      .find(AIMessage.isInstance);
    const transferMessage = new ToolMessage({
      content:
        "order_agent이(가) 이어받았습니다. 고객의 마지막 질문을 도구로 확인해 바로 답하세요.",
      tool_call_id: runtime.toolCallId,
    });
    return new Command({
      goto: "order_agent",
      update: {
        activeAgent: "order_agent",
        messages: [lastAiMessage!, transferMessage],
      },
      graph: Command.PARENT,
    });
  },
  {
    name: "transfer_to_order",
    description: "주문 상태 · 배송 위치 문의를 주문 · 배송 상담원에게 넘긴다.",
    schema: z.object({}),
  },
);
//#endregion

// TODO 2: 상담원 에이전트 2개를 만드세요 — 각자 자기 업무 도구 + 상대에게 넘기는 도구를 가집니다
//#region 정답
const orderAgent = createAgent({
  name: "order_agent", /// 이 에이전트가 만든 AI 메시지에 붙는 이름
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
//#endregion

/// 노드 함수 정의: 그래프의 State(대화 전체)를 그대로 넘겨 상담원 에이전트를 실행한다
const callOrderAgent: GraphNode<typeof HandoffState> = async (state) =>
  orderAgent.invoke(state);
const callBillingAgent: GraphNode<typeof HandoffState> = async (state) =>
  billingAgent.invoke(state);

// TODO 3: 그래프를 조립하세요
//   START → activeAgent가 가리키는 상담원 / 상담원이 답변을 끝냈으면(도구 호출 없는 AI 메시지) END
//#region 정답
/// 라우팅 함수
const afterAgent = (state: typeof HandoffState.State) => {
  const last = state.messages.at(-1); /// at(-1): 배열의 마지막 칸
  /// 마지막 메시지가 도구 호출 없는 AI 답변이면 끝, 아니면 activeAgent에게
  if (last && AIMessage.isInstance(last) && !last.tool_calls?.length)
    return END;
  return state.activeAgent;
};

const graph = new StateGraph(HandoffState)
  .addNode("order_agent", callOrderAgent, { ends: [...AGENTS] }) /// ends: Command로 갈 수 있는 노드
  .addNode("billing_agent", callBillingAgent, { ends: [...AGENTS] })
  .addConditionalEdges(START, (state) => state.activeAgent, [...AGENTS]) /// activeAgent가 가리키는 상담원에게
  .addConditionalEdges("order_agent", afterAgent, [...AGENTS, END])
  .addConditionalEdges("billing_agent", afterAgent, [...AGENTS, END])
  .compile({ checkpointer: new MemorySaver() }); /// activeAgent · 대화가 thread별로 남는다
//#endregion

/// 같은 thread에서 세 번 묻는다 — 두 번째에 대화가 넘어가고, 세 번째는 넘겨받은 상담원이 바로 받는다
const config = { configurable: { thread_id: "C001-handoff" } };
const questions = [
  "A100 주문 어디쯤 왔어요?",
  "벌써 많이 늦었는데, 지연되면 보상이나 환불 받을 수 있나요?",
  "환불하면 돈은 언제 들어와요?",
];
for (const question of questions) {
  const result = await graph.invoke(
    { messages: [{ role: "user", content: question }] },
    config,
  );
  console.log(`\n고객: ${question}`);
  console.log(`[${result.activeAgent}] ${result.messages.at(-1)?.text}`);
  console.log("───────────────────────────────────────────────");
}
