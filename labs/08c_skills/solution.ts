// 정답 코드 — 08c · Skills: 에이전트 하나가 필요한 정책 문서(스킬)만 그때그때 불러온다
// 실행: npx tsx labs/08c_skills/solution.ts
import "dotenv/config";
import * as z from "zod";
import {
  AIMessage,
  createAgent,
  initChatModel,
  createMiddleware,
  tool,
} from "langchain";
import { loadPolicyDocs } from "../../src/data/policies.ts"; /// 정책 문서(*.md)를 Document 목록으로 읽는다
import { getOrderStatus } from "../../src/support-tools.ts"; /// 주문 상태 조회 도구

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

/// 스킬마다 모델에게 보여 줄 한 줄 설명 — 모델은 이것만 보고 어떤 스킬을 불러올지 고른다
const DESCRIPTIONS: Record<string, string> = {
  shipping: "출고 · 도착 기간, 배송비, 배송 지연 보상",
  refund: "교환 · 반품 신청 기간, 반품 배송비, 환불 처리 기간",
  membership: "회원 등급 기준과 등급별 혜택",
  payment: "결제 수단, 이중 결제, 결제 실패",
  products: "제품별 사용법 · 고장 대처, 보증 기간",
};

/// 스킬 = 이름 + 한 줄 설명 + 본문(정책 문서 전체)
const SKILLS = loadPolicyDocs().map((doc) => {
  const name = doc.metadata.source.replace(".md", ""); /// refund.md → refund
  return { name, description: DESCRIPTIONS[name], content: doc.pageContent };
});

// TODO 1: load_skill 도구 — 스킬 이름을 받아 본문 전체를 돌려주세요
//   없는 이름이면 고를 수 있는 스킬 이름 목록을 알려 줍니다
//#region 정답
const loadSkill = tool(
  async ({ skillName }) => {
    const skill = SKILLS.find((s) => s.name === skillName); /// 이름이 같은 스킬을 찾는다
    if (skill)
      return `스킬 ${skillName}을(를) 불러왔습니다.\n\n${skill.content}`;
    return `스킬 ${skillName}은(는) 없습니다. 고를 수 있는 스킬: ${SKILLS.map(
      (s) => s.name,
    ).join(", ")}`;
  },
  {
    name: "load_skill",
    description:
      "스킬(정책 문서)의 전체 내용을 불러온다. 정책을 근거로 답해야 할 때 먼저 쓴다.",
    schema: z.object({
      skillName: z.string().describe("불러올 스킬 이름 (예: refund)"),
    }),
  },
);
//#endregion

// TODO 2: skillMiddleware — 모델을 부를 때마다 시스템 프롬프트 끝에 스킬 목록을 덧붙이세요
//   wrapModelCall(request, handler): handler({ ...request, systemMessage: request.systemMessage.concat("덧붙일 글") })로 모델을 부른다
//   tools: [loadSkill]로 넣으면 이 미들웨어를 쓰는 에이전트에 load_skill 도구가 함께 붙는다
//#region 정답
/// "- refund: 교환 · 반품 신청 기간, ..." 모양의 줄을 스킬마다 하나씩 만든다
const skillList = SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n");

const skillMiddleware = createMiddleware({
  name: "skillMiddleware",
  tools: [loadSkill],
  wrapModelCall: (request, handler) =>
    handler({
      ...request, /// 원래 요청(메시지 · 도구 등)은 그대로 두고
      /// request.systemMessage = createAgent의 systemPrompt로 만든 시스템 메시지
      ///   concat: 원래 내용 뒤에 이어 붙인 새 시스템 메시지를 만든다 (원래 지시는 그대로 남는다)
      systemMessage: request.systemMessage.concat(
        `\n\n## 사용할 수 있는 스킬\n${skillList}\n` +
          "정책 질문이면 load_skill로 필요한 스킬만 불러와 그 내용을 근거로 답해.",
      ),
    }),
});
//#endregion

// TODO 3: skillMiddleware를 넣은 상담 에이전트를 만드세요
//#region 정답
const agent = createAgent({
  model,
  tools: [getOrderStatus],
  systemPrompt:
    "너는 스마트몰 고객지원 상담원이야. 한국어로 짧고 친절하게 답해.",
  middleware: [skillMiddleware], /// 미들웨어 목록
});
//#endregion

/// 질문마다 어떤 스킬을 불러왔는지 보면 "필요한 것만" 불러오는지 확인할 수 있다
const questions = [
  "A100 배송이 너무 늦어요. 늦으면 환불돼요?",
  "VIP 등급은 어떤 혜택이 있어요?",
];
for (const question of questions) {
  const result = await agent.invoke({
    messages: [{ role: "user", content: question }],
  });
  /// AI 메시지의 도구 호출 중 load_skill만 골라 불러온 스킬 이름을 모은다
  const loaded = result.messages
    .flatMap((m) => (AIMessage.isInstance(m) ? m.tool_calls ?? [] : [])) /// AI 메시지의 도구 호출만 한 줄로 모은다
    .filter((call) => call.name === "load_skill")
    .map((call) => call.args.skillName);
  console.log(`\n고객: ${question}`);
  console.log(
    `불러온 스킬: ${loaded.join(", ") || "(없음)"} / 전체 ${SKILLS.length}개`,
  );
  console.log(`상담원: ${result.messages.at(-1)?.text}`);
  console.log("───────────────────────────────────────────────");
}
