// 정답 코드 — 04 · Self-RAG: 만든 답변이 근거에 맞는지 검증하는 노드
// 실행: npx tsx labs/04_self_check/solution.ts
import "dotenv/config";
import * as z from "zod";
import { initChatModel, tool } from "langchain";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import {
  Command, /// 노드가 "State 변경 + 다음에 갈 노드"를 함께 돌려줄 때 쓴다
  END, /// 그래프의 끝 지점
  MessagesValue, /// 메시지 목록용 State 필드 (새 메시지를 뒤에 이어 붙인다)
  START, /// 그래프의 시작 지점
  StateGraph, /// 노드와 엣지로 그래프를 조립하는 도구
  StateSchema, /// 그래프가 들고 다니는 State의 모양을 정한다
  type GraphNode, /// 노드 함수의 타입 (type: 타입으로만 쓰고 실행 코드에는 없다)
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt"; /// 모델이 요청한 도구를 실행해 주는 미리 만든 노드
import { findOrder } from "../../src/data/orders.ts"; /// 가상 주문 데이터 조회 함수
import { loadPolicyDocs } from "../../src/data/policies.ts"; /// 정책 문서(*.md)를 Document 목록으로 읽는 함수

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";
const MAX_CHECKS = 2; // 검증을 이만큼 통과하지 못하면 상담원에게 넘긴다

// 1) 도구: 주문 조회 + 정책 검색 (03 실습에서 만든 것과 같다)
const getOrderStatus = tool(
  /// { orderId }: 입력 객체에서 orderId 값만 꺼내 쓴다 (구조 분해)
  async ({ orderId }) => {
    const order = findOrder(orderId); /// 주문을 찾는다 (없으면 undefined)
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta})`;
  },
  {
    name: "get_order_status", /// 모델이 도구를 부를 때 쓰는 이름
    description: "주문번호로 주문 상태를 조회한다.", /// 언제 쓰는 도구인지 모델에게 알려 준다
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }), /// 입력값 모양: orderId 문자열 하나
  },
);

const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
/// 유사도 점수가 이 값보다 낮은 조각은 "관련 없음"으로 보고 버린다
const MIN_SCORE = 0.3;
/// 03 실습과 같다: 300자 조각(겹침 50자)으로 나눈다
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 300,
  chunkOverlap: 50,
});
const chunks = await splitter.splitDocuments(loadPolicyDocs());
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

const searchPolicy = tool(
  async ({ query }) => {
    /// 질문과 비슷한 조각 3개를 [문서, 점수] 쌍으로 받는다
    const hits = await vectorStore.similaritySearchWithScore(query, 3);
    const found: string[] = []; /// 기준을 넘은 결과를 모을 빈 배열 (string[]: 문자열 목록)
    /// [doc, score]: 쌍의 두 값을 각각 doc, score라는 이름으로 꺼낸다
    for (const [doc, score] of hits) {
      /// 점수가 기준 이상인 조각만 "[출처: 파일]\n본문" 모양으로 담는다
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

/// 에이전트가 쓸 도구 목록
const tools = [getOrderStatus, searchPolicy];

// 2) State: 메시지 + 검증 횟수
/// State = 그래프의 노드들이 함께 읽고 고치는 데이터
const State = new StateSchema({
  messages: MessagesValue, /// 대화 메시지 목록 (노드가 돌려준 메시지는 뒤에 추가된다)
  checkCount: z.number().default(0), /// 검증에 실패한 횟수 (처음 값은 0)
});

// 3) agent 노드
const model = await initChatModel(MODEL, { useResponsesApi: true });
const modelWithTools = model.bindTools(tools);

/// GraphNode<typeof State>: "이 State를 쓰는 노드 함수"라는 타입 표시 (<...>는 타입을 넘기는 자리)
/// 노드는 지금 State를 받아서, 바꿀 값만 객체로 돌려준다
const agent: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    {
      role: "system",
      content:
        "너는 스마트몰 고객지원 상담원이야. 정책 질문은 반드시 search_policy로 확인하고, 도구 결과에 있는 내용만 출처와 함께 답해.",
    },
    /// ...state.messages: 지금까지의 대화 메시지를 이 배열 안에 펼쳐 넣는다 (펼침 연산자)
    ...state.messages,
  ]);
  return { messages: [response] }; /// 모델의 답변을 messages에 추가한다
};

// TODO 1: 검증 결과 스키마를 정의하세요 — grounded(근거에만 기반하면 true), reason(부족한 점)
//#region 정답
/// 검증 모델이 이 모양 그대로 답하게 만든다 (describe: 각 칸에 무엇을 넣을지 모델에게 설명)
const Verdict = z.object({
  grounded: z
    .boolean()
    .describe(
      "답변이 도구 결과(정책 문서 · 주문 정보)에만 근거해 질문에 답했으면 true",
    ), /// 참/거짓
  reason: z.string().describe("근거가 부족하면 무엇이 부족한지"), /// 이유 설명 문자열
});
//#endregion

// TODO 2: check 노드를 만드세요
//   마지막 답변과 도구 결과(ToolMessage)를 모델에 보내 Verdict로 판정하고, Command로 다음 노드를 정합니다.
//   - 근거 있음 → END
//   - checkCount + 1이 MAX_CHECKS 이상 → "handoff"
//   - 그 밖 → checkCount를 1 올리고 "[검증 실패] 이유" 메시지를 남긴 뒤 "agent"
//#region 정답
/// withStructuredOutput: 모델이 글 대신 Verdict 모양의 객체({ grounded, reason })를 돌려주게 한다
const grader = model.withStructuredOutput(Verdict);

/// check: GraphNode<typeof State> → "check는 State를 쓰는 그래프의 노드 함수"라는 타입 표시
const check: GraphNode<typeof State> = async (state) => {
  /// 마지막 메시지(= 방금 만든 답변)의 글자만 꺼낸다 (배열의 마지막 칸 번호 = 길이 - 1)
  const answer = state.messages[state.messages.length - 1].text;

  // 도구 결과(ToolMessage)만 모아 근거로 쓴다
  let evidence = "";
  for (const message of state.messages) {
    /// 이 메시지가 도구 결과이면 evidence 에 누적
    if (ToolMessage.isInstance(message)) evidence += message.text + "\n";
  }

  /// 근거와 답변을 함께 보내 판정을 받는다 — 문서에 없어 답하지 못한 경우도 실패로 본다 (→ 상담원 연결)
  const verdict = await grader.invoke(
    `근거:\n${
      evidence || "(도구 결과 없음)"
    }\n\n답변:\n${answer}\n\n답변이 근거에만 기반해 질문에 답했는지 판정해. "안내되어 있지 않다"처럼 답을 주지 못했으면 false.`,
  );

  /// 근거가 충분하면 그래프를 끝낸다
  if (verdict.grounded) {
    return new Command({ goto: END });
  }
  /// 이번 실패까지 세어 한도에 닿으면 상담원 연결(handoff)로 보낸다
  if (state.checkCount + 1 >= MAX_CHECKS) {
    return new Command({
      update: { checkCount: state.checkCount + 1 }, /// 이번 실패도 센다
      goto: "handoff",
    });
  }
  /// 그 밖: 실패 횟수를 올리고, 실패 이유를 메시지로 남긴 뒤 agent로 돌아가 다시 답하게 한다
  return new Command({
    update: {
      checkCount: state.checkCount + 1,
      messages: [
        new HumanMessage(
          `[검증 실패] ${verdict.reason} 정책을 다시 확인하고 답해.`,
        ),
      ],
    },
    goto: "agent", //.addNode("agent", agent) 분기할 노드명
  });
};
//#endregion

// TODO 3: agent 다음 경로 — 도구 요청이 있으면 "tools", 답변이 완성됐으면 END 대신 "check"
//#region 정답
/// typeof State.State: State에 실제로 담긴 값({ messages, checkCount })의 타입
/// 이 함수가 돌려준 문자열이 다음에 갈 노드 이름이 된다
function routeAfterAgent(state: typeof State.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  /// 모델 답변(AIMessage)에 도구 요청(tool_calls)이 있으면 도구를 실행하러 간다
  /// ?.: tool_calls가 없으면(undefined) 오류 없이 undefined를 돌려준다 (옵셔널 체이닝)
  if (AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length) {
    return "tools";
  }
  return "check"; /// 도구 요청이 없으면 답변이 완성된 것 → 검증하러 간다
}
//#endregion

// 검증을 여러 번 통과하지 못하면 사람 상담원에게 넘긴다
const handoff: GraphNode<typeof State> = async () => {
  /// 안내 메시지 하나를 모델 답변처럼 추가한다
  return {
    messages: [
      new AIMessage(
        "정확한 안내를 위해 상담원을 연결해 드리겠습니다. 잠시만 기다려 주세요.",
      ),
    ],
  };
};

/// 그래프 조립
const graph = new StateGraph(State)
  .addNode("agent", agent) /// 노드 이름과 실행할 함수를 등록
  .addNode("tools", new ToolNode(tools)) /// 도구 실행 노드
  .addNode("check", check, { ends: ["agent", "handoff", END] }) // Command로 갈 수 있는 곳을 알려 준다
  .addNode("handoff", handoff)
  .addEdge(START, "agent") /// 시작하면 agent부터
  .addConditionalEdges("agent", routeAfterAgent, ["tools", "check"]) /// agent 다음은 함수가 정한다
  .addEdge("tools", "agent") /// 도구 실행 뒤에는 다시 agent로
  .addEdge("handoff", END) /// 상담원 안내 뒤에는 끝
  .compile(); /// 실행할 수 있는 그래프로 완성

/// 두 질문을 차례로 실행한다 — 두 번째는 정책 문서에 수리비가 없어 검증을 두 번 통과하지 못하고 상담원에게 넘어간다
for (const question of [
  "단순 변심으로 반품하면 배송비는 얼마예요?",
  "노트북 액정이 깨졌는데 수리비는 얼마예요?",
]) {
  console.log(`\n👤 ${question}`);
  /// invoke: 그래프를 끝까지 실행하고 최종 State를 돌려받는다
  const result = await graph.invoke({
    messages: [{ role: "user", content: question }],
  });
  for (const message of result.messages) {
    console.log(`[${message.type}] ${message.text}`); /// 메시지 종류(human · ai · tool)와 내용
  }
  console.log(`   검증 실패 횟수: ${result.checkCount}`);
}
