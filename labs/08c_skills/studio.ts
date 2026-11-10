import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel, createMiddleware, tool } from "langchain";
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

const loadSkill = tool(
  async ({ skillName }) => {
    const skill = SKILLS.find((s) => s.name === skillName);
    if (skill) return `스킬 ${skillName}을(를) 불러왔습니다.\n\n${skill.content}`;
    return `스킬 ${skillName}은(는) 없습니다. 고를 수 있는 스킬: ${SKILLS.map((s) => s.name).join(", ")}`;
  },
  {
    name: "load_skill",
    description: "스킬(정책 문서)의 전체 내용을 불러온다. 정책을 근거로 답해야 할 때 먼저 쓴다.",
    schema: z.object({ skillName: z.string().describe("불러올 스킬 이름 (예: refund)") }),
  },
);

const skillList = SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n");

const skillMiddleware = createMiddleware({
  name: "skillMiddleware",
  tools: [loadSkill],
  wrapModelCall: (request, handler) =>
    handler({
      ...request,
      systemPrompt: `${request.systemPrompt}\n\n## 사용할 수 있는 스킬\n${skillList}\n` +
        "정책 질문이면 load_skill로 필요한 스킬만 불러와 그 내용을 근거로 답해.",
    }),
});

export const graph = createAgent({
  model,
  tools: [getOrderStatus],
  systemPrompt: "너는 스마트몰 고객지원 상담원이야. 한국어로 짧고 친절하게 답해.",
  middleware: [skillMiddleware],
});
