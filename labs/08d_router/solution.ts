// 정답 코드 — 08d · Router: 질문을 분류해 필요한 전문 에이전트에게 동시에 보내고, 결과를 합친다
// 실행: npx tsx labs/08d_router/solution.ts
import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel } from "langchain";
import {
  END,
  ReducedValue, /// 여러 노드가 동시에 보낸 값을 합치는 방법(reducer)을 가진 State 항목
  Send, /// "이 노드를 이 입력으로 실행해라" — 여러 개를 돌려주면 동시에 실행된다
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

const AGENTS = ["order", "billing", "policy"] as const; /// 전문 에이전트 노드 이름

/// RouterState — 노드들이 함께 쓰는 칠판. 앞 노드가 칸에 쓰고, 뒤 노드가 읽는다
const RouterState = new StateSchema({
  query: z.string(), /// 고객 질문
  routes: z /// 분류 결과 [{ agent, query(하위 질문) }]
    .array(z.object({ agent: z.enum(AGENTS), query: z.string() }))
    .default([]),
  results: new ReducedValue( /// 전문 에이전트 보고 [{ agent, answer }]
    z
      .array(z.object({ agent: z.string(), answer: z.string() }))
      .default(() => []),
    { reducer: (left, right) => left.concat(right) },
  ),
  finalAnswer: z.string().default(""), /// 최종 답변
});

/// 전문 에이전트 3개 생성
const specialists = {
  order: createAgent({
    model,
    tools: [getOrderStatus, trackShipment],
    systemPrompt:
      "너는 주문 · 배송 담당이야. 도구로 확인한 주문 상태와 배송 위치만 짧게 보고해.",
  }),
  billing: createAgent({
    model,
    tools: [getOrderStatus, searchPolicy],
    systemPrompt:
      "너는 결제 · 환불 담당이야. 결제 금액과 환불 · 결제 정책을 도구로 확인해 짧게 보고해.",
  }),
  policy: createAgent({
    model,
    tools: [searchPolicy],
    systemPrompt:
      "너는 제품 · 정책 담당이야. search_policy로 찾은 내용만 출처와 함께 짧게 보고해.",
  }),
};

// TODO 1: classify 노드 — 질문을 보고 필요한 전문 에이전트와 그 에이전트용 하위 질문을 고르세요
//#region 정답
const Routes = z.object({
  /// classify 노드에서 LLM이 돌려줄 답의 모양(스키마)
  routes: z
    .array(
      z.object({
        agent: z.enum(AGENTS),
        query: z.string().describe("이 에이전트에게 맡길 하위 질문"),
      }),
    )
    .describe("질문에 답하는 데 필요한 에이전트만"),
});

///withStructuredOutput(Routes)로 { routes: [{ agent, query }, ...] }를 받아 State의 routes에 넣습니다
const classify: GraphNode<typeof RouterState> = async (state) => {
  const classifier = model.withStructuredOutput(Routes); /// Routes 모양의 구조화된 출력
  const result = await classifier.invoke([
    {
      role: "system",
      content:
        "고객 질문을 보고 필요한 전문 에이전트만 골라, 각자에게 맡길 하위 질문을 만들어.\n" +
        "- order: 주문 상태 · 배송 위치\n- billing: 결제 금액 · 환불 · 결제 문제\n- policy: 배송 · 환불 · 회원 · 제품 정책",
    },
    { role: "user", content: state.query },
  ]);
  return { routes: result.routes };
};
//#endregion

// TODO 2: classify 다음 갈 곳 — routes마다 Send(에이전트 이름, { query: 하위 질문 })을 만들어 배열로 돌려주세요
//#region 정답
const routeToAgents = (state: typeof RouterState.State) =>
  state.routes.map((route) => new Send(route.agent, { query: route.query })); /// Send 여러 개 → 동시에 실행
//#endregion

/// 전문 에이전트 노드 3개 — Send로 받은 { query }(하위 질문)로 에이전트를 실행하고 결과를 results에 보탠다
///   여기서 state.query는 고객의 원래 질문이 아니라 Send로 받은 "그 에이전트 몫의 하위 질문"이다
const askOrder: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.order.invoke({
    messages: [{ role: "user", content: state.query }],
  });
  /// 마지막 메시지(최종 보고)의 글자를 results에 하나 보탠다 — ?? "": 답이 없으면 빈 문자열
  return {
    results: [{ agent: "order", answer: result.messages.at(-1)?.text ?? "" }],
  };
};

const askBilling: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.billing.invoke({
    messages: [{ role: "user", content: state.query }],
  });
  return {
    results: [{ agent: "billing", answer: result.messages.at(-1)?.text ?? "" }],
  };
};

const askPolicy: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.policy.invoke({
    messages: [{ role: "user", content: state.query }],
  });
  return {
    results: [{ agent: "policy", answer: result.messages.at(-1)?.text ?? "" }],
  };
};

/// synthesize 노드 — 전문 에이전트들의 보고를 합쳐 고객에게 보낼 답변 하나로 만든다
const synthesize: GraphNode<typeof RouterState> = async (state) => {
  const reports = state.results
    .map((r) => `[${r.agent}]\n${r.answer}`)
    .join("\n\n");
  const response = await model.invoke([
    {
      role: "system",
      content: `전문 에이전트 보고를 합쳐 고객 질문 "${state.query}"에 한국어로 답해. 겹치는 내용은 한 번만.`,
    },
    { role: "user", content: reports },
  ]);
  return { finalAnswer: response.text };
};

// TODO 3: 그래프를 조립하세요 — classify → (Send) 전문 에이전트들 → synthesize → END
//#region 정답
const graph = new StateGraph(RouterState)
  .addNode("classify", classify)
  .addNode("order", askOrder)
  .addNode("billing", askBilling)
  .addNode("policy", askPolicy)
  .addNode("synthesize", synthesize)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", routeToAgents, [...AGENTS]) /// routeToAgents가 돌려준 Send대로 간다
  .addEdge("order", "synthesize") /// 실행된 에이전트가 모두 끝나면 synthesize가 한 번 실행된다
  .addEdge("billing", "synthesize")
  .addEdge("policy", "synthesize")
  .addEdge("synthesize", END)
  .compile();
//#endregion

const result = await graph.invoke({
  query: "A100 배송이 너무 늦어요. 늦으면 환불돼요?",
});

console.log("=== 분류 결과 ===");
for (const route of result.routes)
  console.log(`${route.agent} ← ${route.query}`);

console.log("\n=== 전문 에이전트 보고 ===");
for (const r of result.results) console.log(`[${r.agent}] ${r.answer}\n`);

console.log("=== 최종 답변 ===");
console.log(result.finalAnswer);
