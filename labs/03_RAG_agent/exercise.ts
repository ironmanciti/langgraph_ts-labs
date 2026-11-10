// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 03 · RAG 에이전트 (문서 로드 → 분할 → 벡터 스토어 · 검색기 → search_policy 도구 → 에이전트 → 구조화 응답)
// 실행: npx tsx labs/03_RAG_agent/exercise.ts
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";
const model = await initChatModel(MODEL, { useResponsesApi: true });
const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });

// TODO 1: src/data/policies 폴더의 정책 문서(*.md)를 읽어 Document 목록을 만드세요
const policyDir = new URL("../../src/data/policies/", import.meta.url);
const docs: Document[] = [];
// ✏️ 여기에 코드를 작성하세요

// TODO 2: RecursiveCharacterTextSplitter로 300자 조각(겹침 50자)으로 나누세요
// ✏️ 여기에 코드를 작성하세요
console.log(`문서 ${docs.length}개 → 조각 ${chunks.length}개`);

// TODO 3: 조각을 임베딩해 MemoryVectorStore에 넣고, 검색기(retriever)를 만드세요 (k: 3)
// ✏️ 여기에 코드를 작성하세요

// 검색해 보기 ① VectorStore: [문서, 유사도 점수] 쌍이 돌아온다
const scored = await vectorStore.similaritySearchWithScore(
  "단순 변심 반품 배송비",
  2,
);
for (const [doc, score] of scored) {
  console.log(
    score.toFixed(3),
    doc.metadata.source,
    doc.pageContent.slice(0, 40),
  );
}

// 검색해 보기 ② Retriever: 점수 없이 가장 가까운 문서 k개가 돌아온다
const found = await retriever.invoke("단순 변심 반품 배송비");
console.log(
  `retriever → ${found.length}건: ${found
    .map((doc) => doc.metadata.source)
    .join(", ")}`,
);

// TODO 4: 검색기를 search_policy 도구로 감싸세요
//   - retriever.invoke(query)로 문서를 찾는다
//   - 결과는 "[출처: refund.md]\n본문" 형태로 이어 붙이고, 하나도 없으면 "관련 정책 문서를 찾지 못했습니다."
// ✏️ 여기에 코드를 작성하세요

console.log(
  "\n" + (await searchPolicy.invoke({ query: "배송이 늦으면 보상이 있나요?" })),
);
// 관련 없는 질문에도 retriever는 가장 가까운 문서 k개를 돌려준다 → 04_self_check에서 점수 기준(MIN_SCORE)으로 걸러 낸다
console.log("\n" + (await searchPolicy.invoke({ query: "점심 메뉴 추천" })));

// TODO 5: search_policy 도구를 가진 RAG 에이전트를 만들고 정책 질문을 해 보세요
// ✏️ 여기에 코드를 작성하세요

console.log("\n=== RAG 에이전트 ===");
for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
}

// TODO 6: 구조화 응답 — 같은 RAG 에이전트의 답변을 { answer, sources, needsHuman } 형식으로 받으세요
// ✏️ 여기에 코드를 작성하세요

const structured = await structuredAgent.invoke({
  messages: [
    { role: "user", content: "단순 변심으로 반품하면 배송비는 누가 내요?" },
  ],
});
console.log("\n=== 구조화 응답 ===");
console.log(structured.structuredResponse);
