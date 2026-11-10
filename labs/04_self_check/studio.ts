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
const MAX_CHECKS = 2;

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
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 300, chunkOverlap: 50 });
const chunks = await splitter.splitDocuments(loadPolicyDocs());
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

const searchPolicy = tool(
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

const tools = [getOrderStatus, searchPolicy];

const State = new StateSchema({
  messages: MessagesValue,
  checkCount: z.number().default(0),
});

const model = await initChatModel(MODEL, { useResponsesApi: true });
const modelWithTools = model.bindTools(tools);

const agent: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    {
      role: "system",
      content: "너는 스마트몰 고객지원 상담원이야. 정책 질문은 반드시 search_policy로 확인하고, 도구 결과에 있는 내용만 출처와 함께 답해.",
    },
    ...state.messages,
  ]);
  return { messages: [response] };
};

const Verdict = z.object({
  grounded: z.boolean().describe("답변이 도구 결과(정책 문서 · 주문 정보)에만 근거해 질문에 답했으면 true"),
  reason: z.string().describe("근거가 부족하면 무엇이 부족한지"),
});

const grader = model.withStructuredOutput(Verdict);

const check: GraphNode<typeof State> = async (state) => {
  const answer = state.messages[state.messages.length - 1].text;

  let evidence = "";
  for (const message of state.messages) {
    if (ToolMessage.isInstance(message)) evidence += message.text + "\n";
  }

  const verdict = await grader.invoke(
    `근거:\n${evidence || "(도구 결과 없음)"}\n\n답변:\n${answer}\n\n답변이 근거에만 기반해 질문에 답했는지 판정해. "안내되어 있지 않다"처럼 답을 주지 못했으면 false.`,
  );

  if (verdict.grounded) {
    return new Command({ goto: END });
  }
  if (state.checkCount + 1 >= MAX_CHECKS) {
    return new Command({ update: { checkCount: state.checkCount + 1 }, goto: "handoff" });
  }
  return new Command({
    update: {
      checkCount: state.checkCount + 1,
      messages: [new HumanMessage(`[검증 실패] ${verdict.reason} 정책을 다시 확인하고 답해.`)],
    },
    goto: "agent",
  });
};

function routeAfterAgent(state: typeof State.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length) {
    return "tools";
  }
  return "check";
}

const handoff: GraphNode<typeof State> = async () => {
  return { messages: [new AIMessage("정확한 안내를 위해 상담원을 연결해 드리겠습니다. 잠시만 기다려 주세요.")] };
};

export const graph = (new StateGraph(State)
  .addNode("agent", agent)
  .addNode("tools", new ToolNode(tools))
  .addNode("check", check, { ends: ["agent", "handoff", END] })
  .addNode("handoff", handoff)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeAfterAgent, ["tools", "check"])
  .addEdge("tools", "agent")
  .addEdge("handoff", END)
  .compile());
