// 정답 코드 — 07 · 메모리 챗봇 (체크포인터 있고 없음 비교 · thread_id로 대화 이어가기 · 장기 메모리 · 시점 되돌리기)
// 실행: npx tsx labs/07_memory/solution.ts
import "dotenv/config";
import * as readline from "node:readline/promises"; /// 터미널에서 사람의 입력을 받는 Node.js 기본 기능
import * as z from "zod";
import { initChatModel } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import {
  END,
  InMemoryStore, /// 메모리에 저장하는 장기 메모리 스토어
  MemorySaver, /// 메모리에 저장하는 체크포인터 (대화 상태 저장)
  MessagesValue, /// 메시지 목록을 담는 State 항목 (새 메시지는 뒤에 이어 붙는다)
  START,
  StateGraph, /// 노드와 엣지로 그래프를 조립하는 클래스
  StateSchema, /// State(그래프가 들고 다니는 값)의 모양을 정한다
  type GraphNode, /// 노드 함수의 타입
  type StateSnapshot, /// 체크포인트 하나(그 시점의 State · 다음 노드 · config)의 타입
} from "@langchain/langgraph";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

/// State: 대화 메시지 목록만 들고 다닌다
const State = new StateSchema({
  messages: MessagesValue,
});

/// Context: 실행할 때 밖에서 넘겨주는 고정 정보 — 고객 ID
const Context = z.object({
  customerId: z.string(),
});

const model = await initChatModel(MODEL, { useResponsesApi: true });

const agent: GraphNode<typeof State> = async (state, config) => {
  let systemPrompt = "너는 스마트몰 고객지원 상담원이야. 한국어로 짧게 답해.";

  // TODO 1: 스토어(장기 메모리)에서 이 고객의 연락 방법을 꺼내 시스템 프롬프트에 붙이세요
  //   위치(namespace): ["preferences", 고객 ID], 키: "contact"
  //#region 정답
  const customerId = config.context?.customerId; /// 실행할 때 넘긴 context의 고객 ID
  // 스토어가 있으면, 이 고객의 선호도 칸에서 “contact” 항목을 꺼내 온다
  const saved = await config.store?.get(["preferences", customerId], "contact");
  if (saved) {
    systemPrompt += `\n고객이 원하는 연락 방법: ${saved.value.method}`;
  }
  //#endregion

  /// ...state.messages: 배열을 펼쳐 넣는다 → [시스템 메시지, 지금까지의 대화 메시지들...]
  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    ...state.messages,
  ]);
  return { messages: [response] }; /// 모델 답변을 messages에 추가
};

/// State: 실행 중에 노드에서 바뀌는 값, Context: 실행할 때마다 밖에서 넘겨주는 고정 정보(고정된 값)
const builder = new StateGraph(State, Context)
  .addNode("agent", agent)
  .addEdge(START, "agent")
  .addEdge("agent", END);

const context = { customerId: "C002" };

/// 터미널에서 한 줄씩 입력을 받는 도구
const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ① 체크포인터 없음 — 이름을 알려 준 뒤 물어보면 기억하지 못한다 (q: 다음 단계로)
console.log(
  "=== ① 체크포인터 없음 ===  (예: 제 이름은 김민준이에요 → 제 이름이 뭐였죠? / q: 다음)",
);
const noMemory = builder.compile(); /// 아무것도 넣지 않고 compile

while (true) {
  const text = (await terminal.question("👤 ")).trim(); /// 입력을 기다린다 (trim: 앞뒤 공백 제거)
  if (text === "q") break;

  const result = await noMemory.invoke(
    { messages: [{ role: "user", content: text }] },
    { context },
  );
  /// 마지막 메시지만 출력
  console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
}

// TODO 2: 체크포인터(MemorySaver)와 스토어(InMemoryStore)를 넣어 그래프를 compile하세요
//#region 정답
const checkpointer = new MemorySaver(); /// thread별 대화 상태를 단계마다 저장한다
const store = new InMemoryStore(); /// thread와 상관없이 남는 장기 메모리
const graph = builder.compile({ checkpointer, store }); /// { checkpointer: checkpointer, store: store }의 줄임
//#endregion

// TODO 3: while 문으로 대화를 이어 가는 챗봇을 만드세요
console.log(
  "\n=== ② 체크포인터 + thread_id ===  (예: 제 이름은 김민준이에요 → 제 이름이 뭐였죠? / q: 다음)",
);
/// thread_id: 대화방 이름 — 같은 이름이면 체크포인터가 앞 대화를 이어서 불러온다
const thread1 = { configurable: { thread_id: "C002-1" }, context };
//#region 정답
while (true) {
  const text = (await terminal.question("👤 ")).trim();
  if (text === "q") break;

  const result = await graph.invoke(
    { messages: [{ role: "user", content: text }] },
    thread1,
  );
  console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
}
//#endregion

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
//#region 정답
/// put(위치, 키, 값) — ["preferences", "C002"] 위치의 "contact" 키에 저장
await store.put(["preferences", "C002"], "contact", { method: "이메일" });
//#endregion
const saved = await store.get(["preferences", "C002"], "contact"); /// 저장된 내용 확인
console.log("스토어에 저장된 값:", saved?.value);

/// ②와 같은 thread_id(C002-1)를 쓴다 — 앞 대화(이름 등)가 그대로 이어진다
console.log(
  "--- 챗봇 시작 (예: 제 이름이랑 원하는 연락 방법이 뭐였죠? 내 이름이 뭐였죠? / q: 끝) ---",
);
while (true) {
  const text = (await terminal.question("👤 ")).trim();
  if (text === "q") break;
  /// 대화 기록은 체크포인터에서, 연락 방법은 스토어에서 읽어 함께 답한다
  const result = await graph.invoke(
    { messages: [{ role: "user", content: text }] },
    thread1,
  );
  console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
}
terminal.close(); /// 입력 받기를 끝낸다 (닫지 않으면 프로그램이 끝나지 않는다) — ④는 입력 없이 실행된다

// ④ 시점 되돌리기 (time-travel) — 체크포인터는 단계마다 스냅샷(체크포인트)을 남긴다
//   공식 문서: https://docs.langchain.com/oss/javascript/langgraph/use-time-travel
console.log("\n=== ④ 시점 되돌리기 (time-travel) ===");

// TODO 5: getStateHistory로 thread1의 체크포인트를 모두 history에 모으세요 (최신이 맨 앞)
const history: StateSnapshot[] = [];
//#region 정답
/// for await: 하나씩 비동기로 돌려주는 목록(async iterable)을 차례로 꺼낸다
for await (const snapshot of graph.getStateHistory(thread1)) {
  history.push(snapshot);
}
//#endregion
console.log(`thread1(C002-1)의 체크포인트 ${history.length}개 — 최신 → 과거`);
for (const snapshot of history.slice(0, 6)) {
  /// metadata.step: 몇 번째 단계 · values: 그 시점의 State · next: 다음에 실행할 노드
  console.log(
    `  step ${snapshot.metadata?.step} · 메시지 ${
      snapshot.values.messages?.length ?? 0
    }개 · 다음 [${snapshot.next.join(", ")}]`,
  );
}
if (history.length > 6) console.log(`  … (과거 ${history.length - 6}개 더)`);

/// 되돌아갈 시점: 첫 질문이 들어가고 agent가 답하기 직전 — next에 agent가 있는 것 중 가장 오래된 것 (.at(-1) = 배열의 마지막 칸)
const beforeFirstAnswer = history
  .filter((s) => s.next.includes("agent"))
  .at(-1)!;
const firstQuestion = beforeFirstAnswer.values.messages[0]; /// 그 시점의 메시지는 첫 질문 하나뿐이다
console.log(
  `\n되돌아갈 시점: checkpoint_id ${beforeFirstAnswer.config.configurable?.checkpoint_id}`,
);
console.log(`그때의 첫 질문: 👤 ${firstQuestion.text}`);

// ⓐ replay — 그 시점의 config(thread_id + checkpoint_id)로 invoke(null): 새 입력 없이 그 뒤의 agent만 다시 실행한다
//   스냅샷의 config에는 context(고객 ID)가 없으므로 실행할 때 함께 넘긴다
/// { ...a, context }: a의 내용을 펼쳐 담고 context를 더한 새 객체
const replay = await graph.invoke(null, {
  ...beforeFirstAnswer.config,
  context,
});
console.log(
  `ⓐ replay → 🤖 ${replay.messages[replay.messages.length - 1].text}`,
);

// TODO 6: updateState로 그 시점의 첫 질문을 "제 이름은 이서연이에요"로 바꾼 갈래(fork)를 만들고, 그 갈래에서 실행하세요
//   같은 id의 메시지를 넣으면 MessagesValue가 뒤에 붙이지 않고 그 메시지를 바꾼다
//#region 정답
const forkConfig = await graph.updateState(beforeFirstAnswer.config, {
  messages: [
    new HumanMessage({
      id: firstQuestion.id,
      content: "제 이름은 이서연이에요",
    }),
  ],
});
const fork = await graph.invoke(null, { ...forkConfig, context }); /// 바뀐 질문으로 agent가 다시 답한다
//#endregion
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
