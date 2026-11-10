// 정답 코드 — 09 · 사람의 승인을 받는 에이전트 (환불 승인 · 수정 · 거절)
// 실행: npx tsx labs/09_refund_approval/solution.ts   (터미널에서 승인 · 수정 · 거절을 입력한다)
import "dotenv/config";
import * as readline from "node:readline/promises"; /// 터미널에서 사람의 입력을 받는 Node.js 기본 기능
import * as z from "zod";
import {
  createAgent,
  initChatModel,
  humanInTheLoopMiddleware,
  tool,
  type Decision,
  type HITLRequest,
} from "langchain";
import { Command, MemorySaver } from "@langchain/langgraph";
import { findOrder } from "../../src/data/orders.ts"; /// 주문번호로 가상 주문 데이터를 찾는다
import { executeRefund } from "../../src/data/tickets.ts"; /// 가상 환불을 실행하고 결과 문장을 돌려준다

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

/// 주문 상태 · 결제 금액 조회 도구 (승인 없이 바로 실행된다)
const getOrderStatus = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId); /// 주문을 찾는다
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta}) · 결제 금액 ${order.amount}원`;
  },
  {
    name: "get_order_status",
    description: "주문번호로 주문 상태를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

// 되돌릴 수 없는 작업 — 사람이 승인한 뒤에만 실행되어야 한다
const refundOrder = tool(
  /// { orderId, amount, reason }: 모델이 넘긴 입력 객체에서 세 값을 바로 꺼낸다
  async ({ orderId, amount, reason }) => {
    return executeRefund(orderId, amount, reason);
  },
  {
    name: "refund_order",
    description: "주문을 환불한다.",
    schema: z.object({
      orderId: z.string().describe("주문번호"),
      amount: z.number().describe("환불 금액(원)"), /// 숫자
      reason: z.string().describe("환불 사유"),
    }),
  },
);

// TODO 1: refund_order를 실행하기 전에 멈추는 에이전트를 만드세요
//   - humanInTheLoopMiddleware의 interruptOn에 refund_order와 허용할 결정(approve · edit · reject)을 적는다
//   - 멈췄다가 이어 가려면 체크포인터가 필요하다
//#region 정답
const agent = createAgent({
  model,
  tools: [getOrderStatus, refundOrder],
  systemPrompt:
    "너는 스마트몰 결제 · 환불 상담원이야. 고객이 환불을 요청하면 get_order_status로 결제 금액을 확인한 뒤, " +
    "고객에게 되묻지 말고 바로 refund_order로 환불해(금액은 결제 금액 전체).",
  /// middleware: 에이전트 실행 중간에 끼어드는 기능 목록
  middleware: [
    humanInTheLoopMiddleware({
      /// interruptOn: 멈출 도구 이름과, 사람이 고를 수 있는 결정
      interruptOn: {
        refund_order: { allowedDecisions: ["approve", "edit", "reject"] },
      },
    }),
  ],
  checkpointer: new MemorySaver(),
});
//#endregion

const config = { configurable: { thread_id: "C001-refund" } };
/// let: 아래 반복문에서 result를 새 결과로 바꿔 넣기 때문에 const 대신 let을 쓴다
let result = await agent.invoke(
  {
    messages: [
      {
        role: "user",
        content: "A101 스마트워치 환불해 주세요. 단순 변심이에요.",
      },
    ],
  },
  config,
);

// TODO 2: 실행이 멈춰 있으면(__interrupt__) 상담원에게 결정을 물어보고, Command({ resume })로 이어 가세요
//   - 승인: { type: "approve" }
//   - 금액 수정: { type: "edit", editedAction: { name: "refund_order", args: { ...원래 인자, amount: 새 금액 } } }
//   - 거절: { type: "reject", message: "거절 이유" }
/// 터미널 입력을 받을 준비 (input: 키보드, output: 화면)
const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
//#region 정답
/// __interrupt__가 있으면 = 승인을 기다리며 멈춘 상태. 멈추지 않을 때까지 반복한다
while (result.__interrupt__) {
  /// as HITLRequest: "이 값은 HITLRequest 모양이다"라고 TypeScript에게 알려 주는 표시
  const hitl = result.__interrupt__[0].value as HITLRequest; // 멈춘 이유: 승인이 필요한 도구 호출 목록
  const request = hitl.actionRequests[0]; /// 첫 번째 승인 요청 (도구 이름 name과 인자 args가 들어 있다)
  console.log("\n⏸ 승인 대기:", request.name, request.args);

  /// question: 질문을 출력하고 사람이 엔터를 칠 때까지 기다린다, trim: 앞뒤 공백 제거
  const answer = (
    await terminal.question("승인(a) / 금액 수정(숫자) / 거절(r): ")
  ).trim();

  let decision: Decision; /// 아래 if 문에서 셋 중 하나의 결정을 넣는다

  if (answer === "a") {
    decision = { type: "approve" }; /// 승인: 모델이 정한 인자 그대로 실행
  } else if (answer !== "" && !isNaN(Number(answer))) {
    /// 숫자를 입력했으면 금액 수정 — Number(answer)로 문자열을 숫자로 바꾼다 (isNaN: 숫자가 아니면 true)
    ///   { ...request.args, amount: 새 금액 }: 원래 인자를 모두 복사하고 amount만 바꾼다
    decision = {
      type: "edit",
      editedAction: {
        name: request.name,
        args: { ...request.args, amount: Number(answer) },
      },
    };
  } else {
    /// 그 밖의 입력은 거절 — message는 모델에게 전달되는 거절 이유
    decision = { type: "reject", message: "상담원이 환불을 거절했습니다." };
  }

  /// Command({ resume }): 멈춘 지점에서 이 결정을 가지고 실행을 이어 간다 (같은 config = 같은 대화)
  result = await agent.invoke(
    new Command({ resume: { decisions: [decision] } }),
    config,
  );
}
//#endregion
terminal.close(); /// 터미널 입력을 닫아야 프로그램이 끝난다

/// 메시지마다 종류(human · ai · tool)와 글자를 출력한다
for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
}
