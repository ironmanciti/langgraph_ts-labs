// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 08d · Router: 질문을 분류해 필요한 전문 에이전트에게 동시에 보내고, 결과를 합친다
// 실행: npx tsx labs/08d_router/exercise.ts
import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel } from "langchain";
import {
  END,
  ReducedValue,
  Send,
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

const AGENTS = ["order", "billing", "policy"] as const;

const RouterState = new StateSchema({
  query: z.string(),
  routes: z
    .array(z.object({ agent: z.enum(AGENTS), query: z.string() }))
    .default([]),
  results: new ReducedValue(
    z
      .array(z.object({ agent: z.string(), answer: z.string() }))
      .default(() => []),
    { reducer: (left, right) => left.concat(right) },
  ),
  finalAnswer: z.string().default(""),
});

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
// ✏️ 여기에 코드를 작성하세요

// TODO 2: classify 다음 갈 곳 — routes마다 Send(에이전트 이름, { query: 하위 질문 })을 만들어 배열로 돌려주세요
// ✏️ 여기에 코드를 작성하세요

const askOrder: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.order.invoke({
    messages: [{ role: "user", content: state.query }],
  });
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
// ✏️ 여기에 코드를 작성하세요

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
