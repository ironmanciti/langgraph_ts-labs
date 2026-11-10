// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 08c · Skills: 에이전트 하나가 필요한 정책 문서(스킬)만 그때그때 불러온다
// 실행: npx tsx labs/08c_skills/exercise.ts
import "dotenv/config";
import * as z from "zod";
import {
  AIMessage,
  createAgent,
  initChatModel,
  createMiddleware,
  tool,
} from "langchain";
import { loadPolicyDocs } from "../../src/data/policies.ts";
import { getOrderStatus } from "../../src/support-tools.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const DESCRIPTIONS: Record<string, string> = {
  shipping: "출고 · 도착 기간, 배송비, 배송 지연 보상",
  refund: "교환 · 반품 신청 기간, 반품 배송비, 환불 처리 기간",
  membership: "회원 등급 기준과 등급별 혜택",
  payment: "결제 수단, 이중 결제, 결제 실패",
  products: "제품별 사용법 · 고장 대처, 보증 기간",
};

const SKILLS = loadPolicyDocs().map((doc) => {
  const name = doc.metadata.source.replace(".md", "");
  return { name, description: DESCRIPTIONS[name], content: doc.pageContent };
});

// TODO 1: load_skill 도구 — 스킬 이름을 받아 본문 전체를 돌려주세요
//   없는 이름이면 고를 수 있는 스킬 이름 목록을 알려 줍니다
// ✏️ 여기에 코드를 작성하세요

// TODO 2: skillMiddleware — 모델을 부를 때마다 시스템 프롬프트 끝에 스킬 목록을 덧붙이세요
//   wrapModelCall(request, handler): handler({ ...request, systemMessage: request.systemMessage.concat("덧붙일 글") })로 모델을 부른다
//   tools: [loadSkill]로 넣으면 이 미들웨어를 쓰는 에이전트에 load_skill 도구가 함께 붙는다
// ✏️ 여기에 코드를 작성하세요

// TODO 3: skillMiddleware를 넣은 상담 에이전트를 만드세요
// ✏️ 여기에 코드를 작성하세요

const questions = [
  "A100 배송이 너무 늦어요. 늦으면 환불돼요?",
  "VIP 등급은 어떤 혜택이 있어요?",
];
for (const question of questions) {
  const result = await agent.invoke({
    messages: [{ role: "user", content: question }],
  });
  const loaded = result.messages
    .flatMap((m) => (AIMessage.isInstance(m) ? m.tool_calls ?? [] : []))
    .filter((call) => call.name === "load_skill")
    .map((call) => call.args.skillName);
  console.log(`\n고객: ${question}`);
  console.log(
    `불러온 스킬: ${loaded.join(", ") || "(없음)"} / 전체 ${SKILLS.length}개`,
  );
  console.log(`상담원: ${result.messages.at(-1)?.text}`);
  console.log("───────────────────────────────────────────────");
}
