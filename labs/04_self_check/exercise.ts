// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 04 · Self-RAG: 만든 답변이 근거에 맞는지 검증하는 노드
// 실행: npx tsx labs/04_self_check/exercise.ts
import "dotenv/config";
import * as z from "zod";
import { initChatModel, tool } from "langchain";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import {
  Command,
  END,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { findOrder } from "../../src/data/orders.ts";
import { loadPolicyDocs } from "../../src/data/policies.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";
const MAX_CHECKS = 2; // 검증을 이만큼 통과하지 못하면 상담원에게 넘긴다

// 1) 도구: 주문 조회 + 정책 검색 (03 실습에서 만든 것과 같다)
const getOrderStatus = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId);
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta})`;
  },
  {
    name: "get_order_status",
    description: "주문번호로 주문 상태를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
const MIN_SCORE = 0.3;
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 300,
  chunkOverlap: 50,
});
const chunks = await splitter.splitDocuments(loadPolicyDocs());
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

const searchPolicy = tool(
  async ({ query }) => {
    const hits = await vectorStore.similaritySearchWithScore(query, 3);
    const found: string[] = [];
    for (const [doc, score] of hits) {
      if (score >= MIN_SCORE)
        found.push(`[출처: ${doc.metadata.source}]\n${doc.pageContent}`);
    }
    if (found.length === 0) return "관련 정책 문서를 찾지 못했습니다.";
    return found.join("\n\n");
  },
  {
    name: "search_policy",
    description:
      "스마트몰 정책(배송 · 환불 · 회원 · 결제 · 제품 FAQ)을 검색한다.",
    schema: z.object({ query: z.string().describe("검색할 내용") }),
  },
);

const tools = [getOrderStatus, searchPolicy];

// 2) State: 메시지 + 검증 횟수
const State = new StateSchema({
  messages: MessagesValue,
  checkCount: z.number().default(0),
});

// 3) agent 노드
const model = await initChatModel(MODEL, { useResponsesApi: true });
const modelWithTools = model.bindTools(tools);

const agent: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    {
      role: "system",
      content:
        "너는 스마트몰 고객지원 상담원이야. 정책 질문은 반드시 search_policy로 확인하고, 도구 결과에 있는 내용만 출처와 함께 답해.",
    },
    ...state.messages,
  ]);
  return { messages: [response] };
};

// TODO 1: 검증 결과 스키마를 정의하세요 — grounded(근거에만 기반하면 true), reason(부족한 점)
// ✏️ 여기에 코드를 작성하세요

// TODO 2: check 노드를 만드세요
//   마지막 답변과 도구 결과(ToolMessage)를 모델에 보내 Verdict로 판정하고, Command로 다음 노드를 정합니다.
//   - 근거 있음 → END
//   - checkCount + 1이 MAX_CHECKS 이상 → "handoff"
//   - 그 밖 → checkCount를 1 올리고 "[검증 실패] 이유" 메시지를 남긴 뒤 "agent"
// ✏️ 여기에 코드를 작성하세요

// TODO 3: agent 다음 경로 — 도구 요청이 있으면 "tools", 답변이 완성됐으면 END 대신 "check"
// ✏️ 여기에 코드를 작성하세요

// 검증을 여러 번 통과하지 못하면 사람 상담원에게 넘긴다
const handoff: GraphNode<typeof State> = async () => {
  return {
    messages: [
      new AIMessage(
        "정확한 안내를 위해 상담원을 연결해 드리겠습니다. 잠시만 기다려 주세요.",
      ),
    ],
  };
};

const graph = new StateGraph(State)
  .addNode("agent", agent)
  .addNode("tools", new ToolNode(tools))
  .addNode("check", check, { ends: ["agent", "handoff", END] }) // Command로 갈 수 있는 곳을 알려 준다
  .addNode("handoff", handoff)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterAgent, ["tools", "check"])
  .addEdge("tools", "agent")
  .addEdge("handoff", END)
  .compile();

for (const question of [
  "단순 변심으로 반품하면 배송비는 얼마예요?",
  "노트북 액정이 깨졌는데 수리비는 얼마예요?",
]) {
  console.log(`\n👤 ${question}`);
  const result = await graph.invoke({
    messages: [{ role: "user", content: question }],
  });
  for (const message of result.messages) {
    console.log(`[${message.type}] ${message.text}`);
  }
  console.log(`   검증 실패 횟수: ${result.checkCount}`);
}
