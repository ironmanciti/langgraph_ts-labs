// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 07 · 메모리 챗봇 (체크포인터 있고 없음 비교 · thread_id로 대화 이어가기 · 장기 메모리 · 시점 되돌리기)
// 실행: npx tsx labs/07_memory/exercise.ts
import "dotenv/config";
import * as readline from "node:readline/promises";
import * as z from "zod";
import { initChatModel } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import {
  END,
  InMemoryStore,
  MemorySaver,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
  type StateSnapshot,
} from "@langchain/langgraph";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const State = new StateSchema({
  messages: MessagesValue,
});

const Context = z.object({
  customerId: z.string(),
});

const model = await initChatModel(MODEL, { useResponsesApi: true });

const agent: GraphNode<typeof State> = async (state, config) => {
  let systemPrompt = "너는 스마트몰 고객지원 상담원이야. 한국어로 짧게 답해.";

  // TODO 1: 스토어(장기 메모리)에서 이 고객의 연락 방법을 꺼내 시스템 프롬프트에 붙이세요
  //   위치(namespace): ["preferences", 고객 ID], 키: "contact"
  // ✏️ 여기에 코드를 작성하세요

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    ...state.messages,
  ]);
  return { messages: [response] };
};

const builder = new StateGraph(State, Context)
  .addNode("agent", agent)
  .addEdge(START, "agent")
  .addEdge("agent", END);

const context = { customerId: "C002" };

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ① 체크포인터 없음 — 이름을 알려 준 뒤 물어보면 기억하지 못한다 (q: 다음 단계로)
console.log(
  "=== ① 체크포인터 없음 ===  (예: 제 이름은 김민준이에요 → 제 이름이 뭐였죠? / q: 다음)",
);
const noMemory = builder.compile();

while (true) {
  const text = (await terminal.question("👤 ")).trim();
  if (text === "q") break;

  const result = await noMemory.invoke(
    { messages: [{ role: "user", content: text }] },
    { context },
  );
  console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
}

// TODO 2: 체크포인터(MemorySaver)와 스토어(InMemoryStore)를 넣어 그래프를 compile하세요
// ✏️ 여기에 코드를 작성하세요

// TODO 3: while 문으로 대화를 이어 가는 챗봇을 만드세요
console.log(
  "\n=== ② 체크포인터 + thread_id ===  (예: 제 이름은 김민준이에요 → 제 이름이 뭐였죠? / q: 다음)",
);
const thread1 = { configurable: { thread_id: "C002-1" }, context };
// ✏️ 여기에 코드를 작성하세요

// 반복문이 끝난 뒤라도 같은 thread_id를 주면 대화가 그대로 이어진다
const again = await graph.invoke(
  { messages: [{ role: "user", content: "제 이름이 뭐였죠?" }] },
  thread1,
);
console.log(
  `같은 thread_id(C002-1)로 다시 질문 → 🤖 ${
    again.messages[again.messages.length - 1].text
  }`,
);

// TODO 4: 스토어에 연락 방법을 저장하세요 → 새 대화방에서도 기억하는지 챗봇으로 확인합니다
console.log("\n=== ③ 장기 메모리 (스토어) ===");
// ✏️ 여기에 코드를 작성하세요
const saved = await store.get(["preferences", "C002"], "contact");
console.log("스토어에 저장된 값:", saved?.value);

console.log(
  "--- 챗봇 시작 (예: 제 이름이랑 원하는 연락 방법이 뭐였죠? 내 이름이 뭐였죠? / q: 끝) ---",
);
while (true) {
  const text = (await terminal.question("👤 ")).trim();
  if (text === "q") break;
  const result = await graph.invoke(
    { messages: [{ role: "user", content: text }] },
    thread1,
  );
  console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
}
terminal.close();

// ④ 시점 되돌리기 (time-travel) — 체크포인터는 단계마다 스냅샷(체크포인트)을 남긴다
//   공식 문서: https://docs.langchain.com/oss/javascript/langgraph/use-time-travel
console.log("\n=== ④ 시점 되돌리기 (time-travel) ===");

// TODO 5: getStateHistory로 thread1의 체크포인트를 모두 history에 모으세요 (최신이 맨 앞)
const history: StateSnapshot[] = [];
// ✏️ 여기에 코드를 작성하세요
console.log(`thread1(C002-1)의 체크포인트 ${history.length}개 — 최신 → 과거`);
for (const snapshot of history.slice(0, 6)) {
  console.log(
    `  step ${snapshot.metadata?.step} · 메시지 ${
      snapshot.values.messages?.length ?? 0
    }개 · 다음 [${snapshot.next.join(", ")}]`,
  );
}
if (history.length > 6) console.log(`  … (과거 ${history.length - 6}개 더)`);

const beforeFirstAnswer = history
  .filter((s) => s.next.includes("agent"))
  .at(-1)!;
const firstQuestion = beforeFirstAnswer.values.messages[0];
console.log(
  `\n되돌아갈 시점: checkpoint_id ${beforeFirstAnswer.config.configurable?.checkpoint_id}`,
);
console.log(`그때의 첫 질문: 👤 ${firstQuestion.text}`);

// ⓐ replay — 그 시점의 config(thread_id + checkpoint_id)로 invoke(null): 새 입력 없이 그 뒤의 agent만 다시 실행한다
//   스냅샷의 config에는 context(고객 ID)가 없으므로 실행할 때 함께 넘긴다
const replay = await graph.invoke(null, {
  ...beforeFirstAnswer.config,
  context,
});
console.log(
  `ⓐ replay → 🤖 ${replay.messages[replay.messages.length - 1].text}`,
);

// TODO 6: updateState로 그 시점의 첫 질문을 "제 이름은 이서연이에요"로 바꾼 갈래(fork)를 만들고, 그 갈래에서 실행하세요
//   같은 id의 메시지를 넣으면 MessagesValue가 뒤에 붙이지 않고 그 메시지를 바꾼다
// ✏️ 여기에 코드를 작성하세요
console.log(
  `ⓑ fork   → 👤 ${fork.messages[0].text}  🤖 ${
    fork.messages[fork.messages.length - 1].text
  }`,
);

// 갈래가 thread1의 최신 시점이 되었다 — checkpoint_id 없이 같은 thread_id로 물으면 갈래에서 이어진다 (원래 기록은 history에 그대로 남는다)
const afterFork = await graph.invoke(
  { messages: [{ role: "user", content: "제 이름이 뭐였죠?" }] },
  thread1,
);
console.log(
  `fork 뒤 같은 thread_id(C002-1)로 질문 → 🤖 ${
    afterFork.messages[afterFork.messages.length - 1].text
  }`,
);
