// 07 실습 ④ 시점 되돌리기(time-travel)가 기대는 동작 테스트 — 실행: npm test
// 모델 대신 받은 질문을 그대로 되돌려 주는 가짜 agent 노드를 써서, API 키 없이 결과가 늘 같게 한다
import assert from "node:assert/strict";
import { test } from "node:test";
import * as z from "zod";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  END,
  MemorySaver,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
  type StateSnapshot,
} from "@langchain/langgraph";

const State = new StateSchema({ messages: MessagesValue });

// 그래프 하나와 agent 실행 횟수를 함께 만든다 (07 실습과 같은 START → agent → END)
function makeGraph() {
  const calls = { agent: 0 };
  const agent: GraphNode<typeof State> = async (state) => {
    calls.agent += 1;
    const question = state.messages[state.messages.length - 1].text;
    return { messages: [new AIMessage(`답: ${question}`)] };
  };
  const graph = new StateGraph(State)
    .addNode("agent", agent)
    .addEdge(START, "agent")
    .addEdge("agent", END)
    .compile({ checkpointer: new MemorySaver() });
  return { graph, calls };
}

type Graph = ReturnType<typeof makeGraph>["graph"];
type Config = { configurable: { thread_id: string } };

async function historyOf(graph: Graph, config: Config) {
  const history: StateSnapshot[] = [];
  for await (const snapshot of graph.getStateHistory(config)) history.push(snapshot);
  return history;
}

// 실습과 같은 방법으로 "첫 질문이 들어가고 agent가 답하기 직전" 체크포인트를 찾는다
const beforeFirstAnswer = (history: StateSnapshot[]) =>
  history.filter((s) => s.next.includes("agent")).at(-1)!;

async function startThread(id: string) {
  const made = makeGraph();
  const config = { configurable: { thread_id: id } };
  await made.graph.invoke({ messages: [new HumanMessage("제 이름은 김민준이에요")] }, config);
  await made.graph.invoke({ messages: [new HumanMessage("제 이름이 뭐였죠?")] }, config);
  return { ...made, config };
}

// 정상 케이스
test("getStateHistory: 최신 체크포인트가 맨 앞이고, 과거로 갈수록 메시지가 적다", async () => {
  const { graph, config } = await startThread("t-history");
  const history = await historyOf(graph, config);

  assert.deepEqual(history[0].next, []); // 최신 = 실행이 끝난 시점
  assert.equal(history[0].values.messages.length, 4); // 질문 2 + 답 2
  const before = beforeFirstAnswer(history);
  assert.equal(before.values.messages.length, 1); // 첫 질문만 들어 있다
  assert.equal(before.values.messages[0].text, "제 이름은 김민준이에요");
  assert.ok(before.config.configurable?.checkpoint_id); // 이 시점의 id
});

test("replay: 과거 config로 invoke(null)하면 그 뒤의 agent만 다시 실행한다", async () => {
  const { graph, calls, config } = await startThread("t-replay");
  const before = beforeFirstAnswer(await historyOf(graph, config));
  const callsBefore = calls.agent;

  const replay = await graph.invoke(null, before.config);

  assert.equal(calls.agent, callsBefore + 1); // agent 한 번 더
  assert.deepEqual(
    replay.messages.map((m) => m.text),
    ["제 이름은 김민준이에요", "답: 제 이름은 김민준이에요"], // 두 번째 질문 이후는 없다
  );
});

test("fork: 같은 id의 메시지로 updateState하면 첫 질문이 바뀐 갈래가 생긴다", async () => {
  const { graph, config } = await startThread("t-fork");
  const before = beforeFirstAnswer(await historyOf(graph, config));
  const first = before.values.messages[0];

  const forkConfig = await graph.updateState(before.config, {
    messages: [new HumanMessage({ id: first.id, content: "제 이름은 이서연이에요" })],
  });
  const fork = await graph.invoke(null, forkConfig);

  assert.deepEqual(
    fork.messages.map((m) => m.text),
    ["제 이름은 이서연이에요", "답: 제 이름은 이서연이에요"], // 새로 붙지 않고 바뀌었다
  );
});

test("fork 뒤에는 checkpoint_id 없이 같은 thread로 물어도 갈래에서 이어진다", async () => {
  const { graph, config } = await startThread("t-head");
  const before = beforeFirstAnswer(await historyOf(graph, config));
  const forkConfig = await graph.updateState(before.config, {
    messages: [new HumanMessage({ id: before.values.messages[0].id, content: "제 이름은 이서연이에요" })],
  });
  await graph.invoke(null, forkConfig);

  const after = await graph.invoke({ messages: [new HumanMessage("제 이름이 뭐였죠?")] }, config);

  assert.equal(after.messages.length, 4);
  assert.equal(after.messages[0].text, "제 이름은 이서연이에요");
});

// 경계 케이스
test("fork해도 원래 기록은 남는다 — 김민준 대화 체크포인트가 history에 그대로 있다", async () => {
  const { graph, config } = await startThread("t-keep");
  const before = beforeFirstAnswer(await historyOf(graph, config));
  const forkConfig = await graph.updateState(before.config, {
    messages: [new HumanMessage({ id: before.values.messages[0].id, content: "제 이름은 이서연이에요" })],
  });
  await graph.invoke(null, forkConfig);

  const texts = (await historyOf(graph, config)).map((s) => s.values.messages?.[0]?.text);
  assert.ok(texts.includes("제 이름은 김민준이에요"));
  assert.ok(texts.includes("제 이름은 이서연이에요"));
});

// 실패 케이스 — 07 실습처럼 Context 스키마가 있는 그래프
test("스냅샷 config에는 context가 없다 — 그대로 replay하면 검증 오류, context를 합치면 실행된다", async () => {
  const Context = z.object({ customerId: z.string() });
  const agent: GraphNode<typeof State> = async (_state, config) => ({
    messages: [new AIMessage(`고객 ${config.context?.customerId}`)],
  });
  const graph = new StateGraph(State, Context)
    .addNode("agent", agent)
    .addEdge(START, "agent")
    .addEdge("agent", END)
    .compile({ checkpointer: new MemorySaver() });
  const context = { customerId: "C002" };
  const config = { configurable: { thread_id: "t-context" }, context };
  await graph.invoke({ messages: [new HumanMessage("안녕하세요")] }, config);

  const history: StateSnapshot[] = [];
  for await (const snapshot of graph.getStateHistory(config)) history.push(snapshot);
  const before = beforeFirstAnswer(history);

  assert.equal((before.config as { context?: unknown }).context, undefined);
  await assert.rejects(graph.invoke(null, before.config)); // customerId 없음
  const replay = await graph.invoke(null, { ...before.config, context });
  assert.equal(replay.messages[replay.messages.length - 1].text, "고객 C002");
});

test("실행이 끝난 최신 체크포인트(next 없음)로 replay하면 agent가 다시 돌지 않는다", async () => {
  const { graph, calls, config } = await startThread("t-noop");
  const latest = (await historyOf(graph, config))[0];
  const callsBefore = calls.agent;

  await graph.invoke(null, latest.config);

  assert.equal(calls.agent, callsBefore);
});
