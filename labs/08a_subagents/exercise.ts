// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 08a · Subagents: 스마트몰 상담 팀 (상담 총괄이 전문 에이전트를 도구로 호출)
// 실행: npx tsx labs/08a_subagents/exercise.ts
import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
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
// ✏️ 여기에 코드를 작성하세요

// TODO 2: 전문 에이전트를 총괄이 부를 수 있는 도구로 감싸세요
//   입력 { request }를 사용자 메시지로 넘겨 실행하고, 마지막 메시지의 text만 돌려줍니다
//   → 전문 에이전트 안의 도구 호출 과정은 총괄에게 보이지 않는다 (컨텍스트 격리)
// ✏️ 여기에 코드를 작성하세요

// TODO 3: 전문 에이전트 도구 3개를 가진 상담 총괄 에이전트를 만드세요
// ✏️ 여기에 코드를 작성하세요

const result = await supervisor.invoke({
  messages: [
    { role: "user", content: "A100 배송이 너무 늦어요. 늦으면 환불돼요?" },
  ],
});

// 총괄의 대화에는 전문 에이전트 호출(ask_*)과 그 결과만 보인다
for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
  console.log("=".repeat(80));
}
