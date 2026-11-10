// 00 · 첫 번째 상담 에이전트 (createAgent + 주문 조회 도구)
// 실행: npx tsx labs/00_first_agent/solution.ts
import "dotenv/config"; // .env의 API 키를 읽는다
import * as z from "zod"; /// 도구 입력값의 모양(스키마)을 정하는 라이브러리
import { createAgent, initChatModel, tool } from "langchain"; /// createAgent: 에이전트 만들기, initChatModel: 모델 만들기, tool: 함수를 도구로 만들기
import { findOrder } from "../../src/data/orders.ts"; // 스마트몰 가상 주문 데이터

// 사용할 모델
const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

// OpenAI는 Responses API로 호출한다 (gpt-6 계열은 Chat Completions에서 추론과 도구를 함께 쓸 수 없다). 다른 회사 모델은 이 옵션을 무시한다
const model = await initChatModel(MODEL, { useResponsesApi: true });

// tool(함수, 설정): 일반 함수를 모델이 호출할 수 있는 도구로 감싼다
const getOrderStatus = tool(
  // 1) 실제로 실행되는 함수 — 모델이 넘긴 인자(schema 모양)를 받는다
  /// async: 안에서 await를 쓸 수 있는 비동기 함수, ({ orderId }): 입력 객체에서 orderId만 꺼낸다(구조 분해)
  async ({ orderId }) => {
    /// 가상 데이터에서 주문을 찾는다 — 없으면 undefined가 돌아온다
    const order = findOrder(orderId);
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta})`;
  },
  // 2) 모델이 보는 도구 정보 — 이름 · 설명 · 입력 스키마로 언제, 어떻게 호출할지 판단한다
  {
    name: "get_order_status", // 모델이 tool_calls에 적는 이름
    description: "주문번호로 주문 상태를 조회한다.", // 이 도구를 언제 쓸지 판단하는 근거
    /// z.object: 객체 모양, z.string(): 문자열, describe: 모델에게 보여 줄 인자 설명
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

// 상담 에이전트 만들기
/// createAgent는 "모델 호출 → 도구 실행 → 다시 모델 호출" 반복을 알아서 해 주는 에이전트를 만든다
const agent = createAgent({
  model, /// 위에서 만든 모델 객체 ({ model: model }을 줄여 쓴 것)
  tools: [getOrderStatus], // 모델이 호출할 수 있는 도구 목록
  systemPrompt:
    "너는 스마트몰 고객지원 상담원이야. 주문 질문은 get_order_status 도구로 확인하고 한국어로 친절하게 답해.",
});

const question = "주문 A100 어디쯤 왔어요?";
console.log(`👤 ${question}`);

/// await: 에이전트 실행이 끝날 때까지 기다렸다가 결과를 result에 담는다
const result = await agent.invoke({
  messages: [{ role: "user", content: question }],
});

// 메시지 흐름: human → ai(도구 요청) → tool → ai
/// result.messages에는 질문부터 최종 답변까지 모든 메시지가 순서대로 들어 있다
for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
}
