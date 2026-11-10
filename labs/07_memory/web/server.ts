// 07 · 메모리 챗봇 — 웹 채팅 버전 (Express 서버 + 채팅 화면)
// 실행: npm run web:07   → http://localhost:3000
// 스펙: labs/07_memory/spec.md
//
//   POST /api/chat   { threadId, message }  → { answer }
//   GET  /           public/index.html (채팅 화면)
import "dotenv/config";
import path from "node:path";
import express, { type Request, type Response } from "express";
import * as z from "zod";
import { initChatModel } from "langchain";
import {
  END,
  InMemoryStore,
  MemorySaver,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

// ── 그래프: solution.ts와 같은 구성 (터미널 입력 · time-travel 부분은 뺐다)
const State = new StateSchema({
  messages: MessagesValue,
});

const Context = z.object({
  customerId: z.string(),
});

const model = await initChatModel(MODEL, { useResponsesApi: true });

const agent: GraphNode<typeof State> = async (state, config) => {
  let systemPrompt = "너는 스마트몰 고객지원 상담원이야. 한국어로 짧게 답해.";

  // 스토어(장기 메모리)에서 이 고객의 연락 방법을 꺼내 시스템 프롬프트에 붙인다
  const customerId = config.context?.customerId;
  const saved = await config.store?.get(["preferences", customerId], "contact");
  if (saved) {
    systemPrompt += `\n고객이 원하는 연락 방법: ${saved.value.method}`;
  }

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    ...state.messages,
  ]);
  return { messages: [response] };
};

const checkpointer = new MemorySaver(); // thread별 대화 상태 (서버를 다시 켜면 초기화)
const store = new InMemoryStore(); // thread와 상관없이 남는 장기 메모리
const graph = new StateGraph(State, Context)
  .addNode("agent", agent)
  .addEdge(START, "agent")
  .addEdge("agent", END)
  .compile({ checkpointer, store });

// 서버가 시작될 때 고객 C002의 연락 방법을 미리 저장해 둔다
await store.put(["preferences", "C002"], "contact", { method: "이메일" });
const context = { customerId: "C002" };

// ── Express 서버
const app = express();
app.use(express.json()); // 요청 본문(JSON) → req.body
app.use(express.static(path.join(import.meta.dirname, "public"))); // 채팅 화면

app.post("/api/chat", async (req: Request, res: Response) => {
  const { threadId, message } = req.body ?? {};
  if (typeof threadId !== "string" || typeof message !== "string" || !message.trim() || message.length > 500) {
    res.status(400).json({ error: "threadId와 message(500자 이내)가 필요합니다." });
    return;
  }
  const result = await graph.invoke(
    { messages: [{ role: "user", content: message }] },
    { configurable: { thread_id: threadId }, context }, // 같은 threadId = 같은 대화방
  );
  res.json({ answer: result.messages[result.messages.length - 1].text }); // 마지막 메시지 = 챗봇의 답
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`07 메모리 챗봇: http://localhost:${port}`));
