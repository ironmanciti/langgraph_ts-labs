import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel, humanInTheLoopMiddleware, tool } from "langchain";
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

export const graph = createAgent({
  model,
  tools: [getOrderStatus, refundOrder],
  systemPrompt:
    "너는 스마트몰 결제 · 환불 상담원이야. 고객이 환불을 요청하면 get_order_status로 결제 금액을 확인한 뒤, " +
    "고객에게 되묻지 말고 바로 refund_order로 환불해(금액은 결제 금액 전체). " +
    "상담원이 금액을 수정할 수 있으니, 결과를 안내할 때는 refund_order 결과에 적힌 금액을 그대로 말해.",
  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        refund_order: { allowedDecisions: ["approve", "edit", "reject"] },
      },
    }),
  ],
});
