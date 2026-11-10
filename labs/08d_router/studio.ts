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
import { getOrderStatus, searchPolicy, trackShipment } from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const AGENTS = ["order", "billing", "policy"] as const;

const RouterState = new StateSchema({
  query: z.string(),
  routes: z.array(z.object({ agent: z.enum(AGENTS), query: z.string() })).default([]),
  results: new ReducedValue(z.array(z.object({ agent: z.string(), answer: z.string() })).default(() => []), {
    reducer: (left, right) => left.concat(right),
  }),
  finalAnswer: z.string().default(""),
});

const specialists = {
  order: createAgent({
    model,
    tools: [getOrderStatus, trackShipment],
    systemPrompt: "너는 주문 · 배송 담당이야. 도구로 확인한 주문 상태와 배송 위치만 짧게 보고해.",
  }),
  billing: createAgent({
    model,
    tools: [getOrderStatus, searchPolicy],
    systemPrompt: "너는 결제 · 환불 담당이야. 결제 금액과 환불 · 결제 정책을 도구로 확인해 짧게 보고해.",
  }),
  policy: createAgent({
    model,
    tools: [searchPolicy],
    systemPrompt: "너는 제품 · 정책 담당이야. search_policy로 찾은 내용만 출처와 함께 짧게 보고해.",
  }),
};

const Routes = z.object({
  routes: z
    .array(z.object({ agent: z.enum(AGENTS), query: z.string().describe("이 에이전트에게 맡길 하위 질문") }))
    .describe("질문에 답하는 데 필요한 에이전트만"),
});

const classify: GraphNode<typeof RouterState> = async (state) => {
  const classifier = model.withStructuredOutput(Routes);
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

const routeToAgents = (state: typeof RouterState.State) =>
  state.routes.map((route) => new Send(route.agent, { query: route.query }));

const askOrder: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.order.invoke({ messages: [{ role: "user", content: state.query }] });
  return { results: [{ agent: "order", answer: result.messages.at(-1)?.text ?? "" }] };
};

const askBilling: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.billing.invoke({ messages: [{ role: "user", content: state.query }] });
  return { results: [{ agent: "billing", answer: result.messages.at(-1)?.text ?? "" }] };
};

const askPolicy: GraphNode<typeof RouterState> = async (state) => {
  const result = await specialists.policy.invoke({ messages: [{ role: "user", content: state.query }] });
  return { results: [{ agent: "policy", answer: result.messages.at(-1)?.text ?? "" }] };
};

const synthesize: GraphNode<typeof RouterState> = async (state) => {
  const reports = state.results.map((r) => `[${r.agent}]\n${r.answer}`).join("\n\n");
  const response = await model.invoke([
    { role: "system", content: `전문 에이전트 보고를 합쳐 고객 질문 "${state.query}"에 한국어로 답해. 겹치는 내용은 한 번만.` },
    { role: "user", content: reports },
  ]);
  return { finalAnswer: response.text };
};

export const graph = (new StateGraph(RouterState)
  .addNode("classify", classify)
  .addNode("order", askOrder)
  .addNode("billing", askBilling)
  .addNode("policy", askPolicy)
  .addNode("synthesize", synthesize)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", routeToAgents, [...AGENTS])
  .addEdge("order", "synthesize")
  .addEdge("billing", "synthesize")
  .addEdge("policy", "synthesize")
  .addEdge("synthesize", END)
  .compile());
