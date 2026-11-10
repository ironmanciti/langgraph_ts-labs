// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 09 · 사람의 승인을 받는 에이전트 (환불 승인 · 수정 · 거절)
// 실행: npx tsx labs/09_refund_approval/exercise.ts   (터미널에서 승인 · 수정 · 거절을 입력한다)
import "dotenv/config";
import * as readline from "node:readline/promises";
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
import { findOrder } from "../../src/data/orders.ts";
import { executeRefund } from "../../src/data/tickets.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

const getOrderStatus = tool(
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

// 되돌릴 수 없는 작업 — 사람이 승인한 뒤에만 실행되어야 한다
const refundOrder = tool(
  async ({ orderId, amount, reason }) => {
    return executeRefund(orderId, amount, reason);
  },
  {
    name: "refund_order",
    description: "주문을 환불한다.",
    schema: z.object({
      orderId: z.string().describe("주문번호"),
      amount: z.number().describe("환불 금액(원)"),
      reason: z.string().describe("환불 사유"),
    }),
  },
);

// TODO 1: refund_order를 실행하기 전에 멈추는 에이전트를 만드세요
//   - humanInTheLoopMiddleware의 interruptOn에 refund_order와 허용할 결정(approve · edit · reject)을 적는다
//   - 멈췄다가 이어 가려면 체크포인터가 필요하다
// ✏️ 여기에 코드를 작성하세요

const config = { configurable: { thread_id: "C001-refund" } };
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
const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
// ✏️ 여기에 코드를 작성하세요
terminal.close();

for (const message of result.messages) {
  console.log(`[${message.type}] ${message.text}`);
}
