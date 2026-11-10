// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 08b · Handoffs: 상담원끼리 대화를 넘긴다 (넘겨받은 상담원이 고객과 직접 대화)
// 실행: npx tsx labs/08b_handoffs/exercise.ts
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
  Command,
  END,
  MemorySaver,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import {
  getOrderStatus,
  searchPolicy,
  trackShipment,
} from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const AGENTS = ["order_agent", "billing_agent"] as const;

const HandoffState = new StateSchema({
  messages: MessagesValue,
  activeAgent: z.enum(AGENTS).default("order_agent"),
});

// TODO 1: 대화를 다른 상담원에게 넘기는 도구 2개를 만드세요 (transfer_to_billing, transfer_to_order)
//   Command로 ① 부모 그래프(graph: Command.PARENT)의 상대 상담원 노드로 이동(goto)하고
//   ② activeAgent를 그 상담원으로 바꾸고
//   ③ 넘기기 직전 AI 메시지 + 도구 결과(ToolMessage)를 messages에 남깁니다
// ✏️ 여기에 코드를 작성하세요

// TODO 2: 상담원 에이전트 2개를 만드세요 — 각자 자기 업무 도구 + 상대에게 넘기는 도구를 가집니다
// ✏️ 여기에 코드를 작성하세요

const callOrderAgent: GraphNode<typeof HandoffState> = async (state) =>
  orderAgent.invoke(state);
const callBillingAgent: GraphNode<typeof HandoffState> = async (state) =>
  billingAgent.invoke(state);

// TODO 3: 그래프를 조립하세요
//   START → activeAgent가 가리키는 상담원 / 상담원이 답변을 끝냈으면(도구 호출 없는 AI 메시지) END
// ✏️ 여기에 코드를 작성하세요

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
