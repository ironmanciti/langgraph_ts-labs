import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
import { getOrderStatus, searchPolicy, trackShipment } from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const orderAgent = createAgent({
  model,
  tools: [getOrderStatus, trackShipment],
  systemPrompt: "너는 주문 · 배송 담당 상담원이야. 도구로 확인한 주문 상태와 배송 위치만 짧게 보고해.",
});

const billingAgent = createAgent({
  model,
  tools: [getOrderStatus, searchPolicy],
  systemPrompt: "너는 결제 · 환불 담당 상담원이야. 결제 금액과 환불 · 결제 정책을 도구로 확인해 짧게 보고해.",
});

const policyAgent = createAgent({
  model,
  tools: [searchPolicy],
  systemPrompt: "너는 제품 · 정책 담당 상담원이야. search_policy로 찾은 내용만 출처와 함께 짧게 보고해.",
});

const askOrderAgent = tool(
  async ({ request }) => {
    const result = await orderAgent.invoke({ messages: [{ role: "user", content: request }] });
    return result.messages[result.messages.length - 1].text;
  },
  {
    name: "ask_order_agent",
    description: "주문 상태 · 배송 위치를 주문 · 배송 에이전트에게 묻는다.",
    schema: z.object({ request: z.string().describe("전문 에이전트에게 맡길 요청") }),
  },
);

const askBillingAgent = tool(
  async ({ request }) => {
    const result = await billingAgent.invoke({ messages: [{ role: "user", content: request }] });
    return result.messages[result.messages.length - 1].text;
  },
  {
    name: "ask_billing_agent",
    description: "결제 금액 · 환불 · 결제 문제를 결제 · 환불 에이전트에게 묻는다.",
    schema: z.object({ request: z.string().describe("전문 에이전트에게 맡길 요청") }),
  },
);

const askPolicyAgent = tool(
  async ({ request }) => {
    const result = await policyAgent.invoke({ messages: [{ role: "user", content: request }] });
    return result.messages[result.messages.length - 1].text;
  },
  {
    name: "ask_policy_agent",
    description: "배송 · 환불 · 회원 · 제품 정책을 제품 · 정책 에이전트에게 묻는다.",
    schema: z.object({ request: z.string().describe("전문 에이전트에게 맡길 요청") }),
  },
);

export const graph = createAgent({
  model,
  tools: [askOrderAgent, askBillingAgent, askPolicyAgent],
  systemPrompt:
    "너는 스마트몰 상담 총괄이야. 직접 조회하지 말고 알맞은 전문 에이전트에게 필요한 만큼만 맡긴 뒤, " +
    "받은 결과를 종합해 고객에게 한국어로 답해. 인사처럼 간단한 대화는 직접 답해.",
});
