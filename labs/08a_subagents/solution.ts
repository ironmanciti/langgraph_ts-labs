// 정답 코드 — 08a · Subagents: 스마트몰 상담 팀 (상담 총괄이 전문 에이전트를 도구로 호출)
// 실행: npx tsx labs/08a_subagents/solution.ts
import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
/// 전문 에이전트들이 쓸 도구
import {
  getOrderStatus,
  searchPolicy,
  trackShipment,
} from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

// TODO 1: 전문 에이전트 3개를 만드세요 — 에이전트마다 도구와 프롬프트를 나눕니다
//   - 주문 · 배송 담당: getOrderStatus, trackShipment
//   - 결제 · 환불 담당: getOrderStatus, searchPolicy
//   - 제품 · 정책 담당: searchPolicy
//#region 정답
/// 주문 · 배송 담당 에이전트 — 자기 일에 필요한 도구만 받는다
const orderAgent = createAgent({
  model,
  tools: [getOrderStatus, trackShipment], /// 이 에이전트가 쓸 수 있는 도구
  systemPrompt:
    "너는 주문 · 배송 담당 상담원이야. 도구로 확인한 주문 상태와 배송 위치만 짧게 보고해.", /// 역할 지시
});

/// 결제 · 환불 담당 에이전트
const billingAgent = createAgent({
  model,
  tools: [getOrderStatus, searchPolicy],
  systemPrompt:
    "너는 결제 · 환불 담당 상담원이야. 결제 금액과 환불 · 결제 정책을 도구로 확인해 짧게 보고해.",
});

/// 제품 · 정책 담당 에이전트
const policyAgent = createAgent({
  model,
  tools: [searchPolicy],
  systemPrompt:
    "너는 제품 · 정책 담당 상담원이야. search_policy로 찾은 내용만 출처와 함께 짧게 보고해.",
});
//#endregion

// TODO 2: 전문 에이전트를 총괄이 부를 수 있는 도구로 감싸세요
//   입력 { request }를 사용자 메시지로 넘겨 실행하고, 마지막 메시지의 text만 돌려줍니다
//   → 전문 에이전트 안의 도구 호출 과정은 총괄에게 보이지 않는다 (컨텍스트 격리)
//#region 정답
/// 총괄이 이 도구를 부르면 → 주문 · 배송 에이전트가 처음부터 끝까지 실행된다
const askOrderAgent = tool(
  async ({ request }) => {
    /// 총괄이 정한 요청 문장을 사용자 메시지로 넘겨 전문 에이전트를 실행한다
    const result = await orderAgent.invoke({
      messages: [{ role: "user", content: request }],
    });
    /// 마지막 메시지(= 전문 에이전트의 최종 보고)의 글자만 돌려준다
    return result.messages[result.messages.length - 1].text;
  },
  {
    name: "ask_order_agent",
    description: "주문 상태 · 배송 위치를 주문 · 배송 에이전트에게 묻는다.",
    schema: z.object({
      request: z.string().describe("전문 에이전트에게 맡길 요청"),
    }),
  },
);

/// 결제 · 환불 에이전트를 감싼 도구
const askBillingAgent = tool(
  async ({ request }) => {
    const result = await billingAgent.invoke({
      messages: [{ role: "user", content: request }],
    });
    return result.messages[result.messages.length - 1].text;
  },
  {
    name: "ask_billing_agent",
    description:
      "결제 금액 · 환불 · 결제 문제를 결제 · 환불 에이전트에게 묻는다.",
    schema: z.object({
      request: z.string().describe("전문 에이전트에게 맡길 요청"),
    }),
  },
);

/// 제품 · 정책 에이전트를 감싼 도구
const askPolicyAgent = tool(
  async ({ request }) => {
    const result = await policyAgent.invoke({
      messages: [{ role: "user", content: request }],
    });
    return result.messages[result.messages.length - 1].text;
  },
  {
    name: "ask_policy_agent",
    description:
      "배송 · 환불 · 회원 · 제품 정책을 제품 · 정책 에이전트에게 묻는다.",
    schema: z.object({
      request: z.string().describe("전문 에이전트에게 맡길 요청"),
    }),
  },
);
//#endregion

// TODO 3: 전문 에이전트 도구 3개를 가진 상담 총괄 에이전트를 만드세요
//#region 정답
/// 상담 총괄 — 도구는 전문 에이전트 3개
const supervisor = createAgent({
  model,
  tools: [askOrderAgent, askBillingAgent, askPolicyAgent],
  systemPrompt:
    "너는 스마트몰 상담 총괄이야. 직접 조회하지 말고 알맞은 전문 에이전트에게 필요한 만큼만 맡긴 뒤, " +
    "받은 결과를 종합해 고객에게 한국어로 답해. 인사처럼 간단한 대화는 직접 답해.",
});
//#endregion

/// 배송 지연 + 환불 질문 → 총괄이 주문 · 배송 담당(배송 상태)과 제품 · 정책 담당(지연 환불 규정)에게 나눠 맡긴다
const result = await supervisor.invoke({
  messages: [
    { role: "user", content: "A100 배송이 너무 늦어요. 늦으면 환불돼요?" },
  ],
});

// 총괄의 대화에는 전문 에이전트 호출(ask_*)과 그 결과만 보인다
/// 메시지마다 종류(human · ai · tool)와 글자를 출력한다
for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
  console.log("=".repeat(80));
}
