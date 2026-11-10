// 정답 코드 — 03 · RAG 에이전트 (문서 로드 → 분할 → 벡터 스토어 · 검색기 → search_policy 도구 → 에이전트 → 구조화 응답)
// 실행: npx tsx labs/03_RAG_agent/solution.ts
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs"; /// 폴더 안 파일 목록 보기 · 파일 읽기
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
import { Document } from "@langchain/core/documents"; /// pageContent + metadata를 담는 문서 객체
import { OpenAIEmbeddings } from "@langchain/openai"; /// 임베딩 모델 (OpenAI)
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";
const model = await initChatModel(MODEL, { useResponsesApi: true });
const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });

// TODO 1: src/data/policies 폴더의 정책 문서(*.md)를 읽어 Document 목록을 만드세요
/// 정책 문서 폴더 위치 — 상대 경로 계산
const policyDir = new URL("../../src/data/policies/", import.meta.url);
/// 읽어 들인 문서를 담을 빈 배열 — Document[]는 "Document 여러 개의 목록"이라는 타입 표시
const docs: Document[] = [];
//#region 정답
/// 폴더 안의 파일 이름을 하나씩 꺼낸다 (delivery.md, refund.md, ...)
for (const file of readdirSync(policyDir)) {
  /// 파일 내용을 문자열로 읽는다
  const text = readFileSync(new URL(file, policyDir), "utf8");
  /// 본문과 출처(파일 이름)를 담은 Document를 만들어 목록에 넣는다
  docs.push(new Document({ pageContent: text, metadata: { source: file } }));
}
//#endregion

// TODO 2: RecursiveCharacterTextSplitter로 300자 조각(겹침 50자)으로 나누세요
//#region 정답
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 300,
  chunkOverlap: 50,
});
/// 문서마다 나눈 조각을 모두 모은다
const chunks = await splitter.splitDocuments(docs);
//#endregion
console.log(`문서 ${docs.length}개 → 조각 ${chunks.length}개`); /// 나누기 전후 개수 확인

// TODO 3: 조각을 임베딩해 MemoryVectorStore에 넣고, 검색기(retriever)를 만드세요 (k: 3)
//#region 정답
/// 조각마다 임베딩(벡터)을 계산해 메모리 저장소에 넣는다
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
/// 검색기: 질문을 넣으면 가장 비슷한 조각 k개를 돌려준다
const retriever = vectorStore.asRetriever({ k: 3 });
//#endregion

// 검색해 보기 ① VectorStore: [문서, 유사도 점수] 쌍이 돌아온다
/// 두 번째 인자 2 = 가장 비슷한 조각 2개만 받는다
const scored = await vectorStore.similaritySearchWithScore(
  "단순 변심 반품 배송비",
  2,
);
/// [doc, score]: 배열의 두 값을 각각 doc, score라는 이름으로 꺼낸다
for (const [doc, score] of scored) {
  /// 점수(소수 셋째 자리까지) · 출처 파일 · 본문 앞 40글자를 출력한다
  console.log(
    score.toFixed(3),
    doc.metadata.source,
    doc.pageContent.slice(0, 40),
  );
}

// 검색해 보기 ② Retriever: 점수 없이 가장 가까운 문서 k개가 돌아온다
const found = await retriever.invoke("단순 변심 반품 배송비");
/// map으로 문서마다 출처만 뽑고, join으로 ", "를 넣어 한 줄로 이어 붙인다
console.log(
  `retriever → ${found.length}건: ${found
    .map((doc) => doc.metadata.source)
    .join(", ")}`,
);

// TODO 4: 검색기를 search_policy 도구로 감싸세요
//   - retriever.invoke(query)로 문서를 찾는다
//   - 결과는 "[출처: refund.md]\n본문" 형태로 이어 붙이고, 하나도 없으면 "관련 정책 문서를 찾지 못했습니다."
//#region 정답
/// tool(실행할 함수, 도구 설명) — 에이전트는 이름 · 설명 · 스키마를 보고 언제 쓸지 정한다
const searchPolicy = tool(
  /// 모델이 정한 입력값({ query })을 받아 실행되는 함수
  async ({ query }) => {
    const hits = await retriever.invoke(query); /// 질문과 비슷한 조각 3개를 찾는다
    if (hits.length === 0) return "관련 정책 문서를 찾지 못했습니다."; /// 결과가 없을 때의 답
    /// 조각마다 "[출처: 파일]\n본문"으로 만들고, 빈 줄을 사이에 두고 이어 붙인다
    return hits
      .map((doc) => `[출처: ${doc.metadata.source}]\n${doc.pageContent}`)
      .join("\n\n");
  },
  {
    name: "search_policy", /// 모델이 도구를 부를 때 쓰는 이름
    description:
      "스마트몰 정책(배송 · 환불 · 회원 · 결제 · 제품 FAQ)을 검색한다.", /// 언제 쓰는 도구인지 모델에게 알려 준다
    schema: z.object({ query: z.string().describe("검색할 내용") }), /// 입력값 모양: query라는 문자열 하나
  },
);
//#endregion

/// 도구도 invoke로 직접 실행해 볼 수 있다 (에이전트 없이 결과만 확인)
console.log(
  "\n" + (await searchPolicy.invoke({ query: "배송이 늦으면 보상이 있나요?" })),
);
// 관련 없는 질문에도 retriever는 가장 가까운 문서 k개를 돌려준다 → 04_self_check에서 점수 기준(MIN_SCORE)으로 걸러 낸다
console.log("\n" + (await searchPolicy.invoke({ query: "점심 메뉴 추천" })));

// TODO 5: search_policy 도구를 가진 RAG 에이전트를 만들고 정책 질문을 해 보세요
//#region 정답
/// 에이전트 = 모델 + 도구. 모델이 질문을 보고 검색이 필요하면 스스로 search_policy를 부른다
const agent = createAgent({
  model,
  tools: [searchPolicy], /// 에이전트가 쓸 수 있는 도구 목록
  systemPrompt:
    "너는 스마트몰 고객지원 상담원이야. 정책 질문은 반드시 search_policy로 찾은 내용만 근거로 답하고, " +
    "답변 끝에 출처 파일명을 밝혀. 검색 결과에 없는 내용은 모른다고 답해.",
});

const result = await agent.invoke({
  messages: [
    { role: "user", content: "단순 변심으로 반품하면 배송비는 누가 내요?" },
  ],
});
//#endregion

console.log("\n=== RAG 에이전트 ===");
/// 대화 기록 전체 출력: human(질문) → ai(도구 호출) → tool(검색 결과) → ai(최종 답변)
for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
}

// TODO 6: 구조화 응답 — 같은 RAG 에이전트의 답변을 { answer, sources, needsHuman } 형식으로 받으세요
//#region 정답
/// 최종 답변의 모양 — 모델이 이 칸들을 채운 객체로 답한다
const PolicyAnswer = z.object({
  answer: z.string().describe("고객에게 보낼 답변"), /// 문자열
  sources: z
    .array(z.string())
    .describe("근거로 쓴 정책 파일 이름 (예: refund.md)"), /// 문자열 목록
  needsHuman: z
    .boolean()
    .describe("검색 결과로 답할 수 없어 사람 상담원이 이어받아야 하면 true"), /// 참/거짓
});

const structuredAgent = createAgent({
  model,
  tools: [searchPolicy],
  systemPrompt:
    "너는 스마트몰 고객지원 상담원이야. 정책 질문은 반드시 search_policy로 찾은 내용만 근거로 답해.",
  responseFormat: PolicyAnswer, /// 마지막 답변을 이 형식으로 받는다
});
//#endregion

const structured = await structuredAgent.invoke({
  messages: [
    { role: "user", content: "단순 변심으로 반품하면 배송비는 누가 내요?" },
  ],
});
console.log("\n=== 구조화 응답 ===");
/// 정해진 형식의 결과는 structuredResponse에 들어 있다 — 화면 · DB · 다른 시스템에서 바로 쓸 수 있다
console.log(structured.structuredResponse);
