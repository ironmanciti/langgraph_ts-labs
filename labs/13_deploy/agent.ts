// 13 · 배포할 고객 상담 챗봇 — 주문 조회 · 배송 조회 · 정책 읽기 도구를 가진 에이전트 하나
//   Express 서버(solution.ts): createSupportAgent(new MemorySaver())로 대화 저장소를 붙여 만든다
//   Studio(npm run dev):       langgraph.json의 "13_support"가 graph를 불러온다 (저장소는 개발 서버가 제공)
import "dotenv/config"; // .env의 API 키 · MODEL 값을 읽는다
import { readdirSync, readFileSync } from "node:fs";
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { findOrder, trackParcel } from "./data/orders.ts"; // 이 폴더 안의 데이터만 쓴다 (폴더 하나로 배포)

// 사용할 모델 — .env의 MODEL 값을 쓰고, 없으면 기본 모델을 쓴다 (예: "anthropic:claude-haiku-4-5", "google:gemini-3.6-flash")
const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

// OpenAI는 Responses API로 호출한다 (gpt-6 계열은 Chat Completions에서 추론과 도구를 함께 쓸 수 없다). 다른 회사 모델은 이 옵션을 무시한다
const model = await initChatModel(MODEL, { useResponsesApi: true });

// ─── 도구 ───
const getOrderStatus = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId);
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta}) · 결제 금액 ${order.amount}원`;
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

// 정책 문서는 5개뿐이고 짧다 → 임베딩 · 벡터 검색 없이 주제를 골라 문서를 통째로 읽는다 (08c 스킬과 같은 방식)
//   서버를 켤 때 임베딩을 계산하지 않으므로 배포한 서버가 바로 응답한다
const POLICY_DIR = new URL("./data/policies/", import.meta.url);
const POLICIES = new Map(
  readdirSync(POLICY_DIR).map((file) => [file.replace(".md", ""), readFileSync(new URL(file, POLICY_DIR), "utf8")]),
);

const loadPolicy = tool(
  async ({ topic }) => `[출처: ${topic}.md]\n${POLICIES.get(topic)}`,
  {
    name: "load_policy",
    description:
      "스마트몰 정책 문서 하나를 통째로 읽는다. shipping: 배송 기간 · 지연 보상, refund: 교환 · 반품 · 환불, " +
      "membership: 회원 등급 · 혜택, payment: 결제 수단 · 결제 오류, products: 제품 사용법 · 보증",
    schema: z.object({
      topic: z.enum(["shipping", "refund", "membership", "payment", "products"]).describe("읽을 정책 주제"),
    }),
  },
);

// ─── 상담 챗봇 ───
// checkpointer: 대화를 저장할 곳 (Express 서버는 MemorySaver, Studio는 생략 — 개발 서버가 붙여 준다)
export function createSupportAgent(checkpointer?: BaseCheckpointSaver) {
  return createAgent({
    model,
    tools: [getOrderStatus, trackShipment, loadPolicy],
    systemPrompt:
      "너는 스마트몰 고객 상담 챗봇이야. 주문 상태 · 배송 위치는 도구로 확인하고, " +
      "배송 · 환불 · 회원 · 결제 · 제품 정책은 load_policy로 문서를 읽은 뒤 그 내용만 근거로 답해. 한국어로 짧고 친절하게.",
    checkpointer,
  });
}

// Studio(npm run dev)용 — 개발 서버가 저장소를 붙여 준다
export const graph = createSupportAgent();
