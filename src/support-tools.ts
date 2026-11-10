// 스마트몰 상담 도구 모음 — 08a~08d 멀티 에이전트 실습이 함께 쓴다 (앞 실습에서 만든 도구와 같다)
//   get_order_status · track_shipment · search_policy
import * as z from "zod";
import { tool } from "langchain";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { findOrder, trackParcel } from "./data/orders.ts";
import { loadPolicyDocs } from "./data/policies.ts";

/** 주문 상태 조회 — 결제 금액도 함께 알려 준다 */
export const getOrderStatus = tool(
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

/** 배송 위치 조회 */
export const trackShipment = tool(
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

// 정책 검색 준비 (03 실습과 같다)
const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
const MIN_SCORE = 0.3;
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 300, chunkOverlap: 50 });
const chunks = await splitter.splitDocuments(loadPolicyDocs());
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

/** 정책 검색 — 점수가 기준 이상인 조각만 출처와 함께 돌려준다 */
export const searchPolicy = tool(
  async ({ query }) => {
    const hits = await vectorStore.similaritySearchWithScore(query, 3);
    const found: string[] = [];
    for (const [doc, score] of hits) {
      if (score >= MIN_SCORE) found.push(`[출처: ${doc.metadata.source}]\n${doc.pageContent}`);
    }
    if (found.length === 0) return "관련 정책 문서를 찾지 못했습니다.";
    return found.join("\n\n");
  },
  {
    name: "search_policy",
    description: "스마트몰 정책(배송 · 환불 · 회원 · 결제 · 제품 FAQ)을 검색한다.",
    schema: z.object({ query: z.string().describe("검색할 내용") }),
  },
);
