// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 11 · MCP Client 활용 (SDK 클라이언트 → MCPAdapter → 상담 에이전트)
// 실행: npx tsx labs/11_mcp_client/exercise.ts   (10 실습 서버를 stdio 하위 프로세스로 자동 실행한다)
import "dotenv/config";
import * as z from "zod";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { MCPAdapter } from "@langchain/mcp-adapters";
import { createAgent, initChatModel, tool } from "langchain";
import { findOrder } from "../../src/data/orders.ts";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

// 10 실습 서버를 실행하는 명령 (프로젝트 폴더에서 실행한다고 가정)
const ticketServer = {
  command: "node",
  args: ["--import", "tsx", "labs/10_ticket_mcp_server/solution.ts"],
};

// ─── 1. SDK 클라이언트로 MCP 수명 주기 직접 체험하기 ───
console.log("=== 1. SDK 클라이언트 ===");
const client = new Client({ name: "support-agent", version: "1.0.0" });

// TODO 1: connect → readResource(customers://C001/profile) → close
//   connect 뒤의 작업은 try에, close는 finally에 둡니다 (중간에 오류가 나도 연결을 닫는다)
// ✏️ 여기에 코드를 작성하세요

// ─── 2. MCPAdapter: MCP 도구를 LangChain 도구로 바꿔 에이전트에 연결하기 ───
console.log("\n=== 2. MCPAdapter + 상담 에이전트 ===");

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

// TODO 2: MCPAdapter에 티켓 서버를 tickets라는 이름으로 등록하세요
// ✏️ 여기에 코드를 작성하세요

// 에이전트가 MCP 도구를 쓰는 동안 어댑터를 열어 두고, 다 쓰면 finally에서 닫는다
try {
  const mcpTools = await adapter.listTools(); // 이름 앞에 서버 이름이 붙는다 (tickets_create_ticket …)
  console.log(
    "MCP 도구:",
    mcpTools.map((t) => t.name),
  );

  // TODO 3: 로컬 도구(getOrderStatus)와 MCP 도구를 함께 쓰는 상담 에이전트를 만들고 실행하세요
  // ✏️ 여기에 코드를 작성하세요

  // 리소스 · 프롬프트도 어댑터로 가져올 수 있다
  console.log(
    "\n고객 프로필:",
    await adapter.readResource("tickets", "customers://C001/profile"),
  );
  const ticketsClient = await adapter.getClient("tickets");
  const prompt = await ticketsClient?.getPrompt({
    name: "apology_reply",
    arguments: { ticketId: "T-1001" },
  });
  console.log("사과 답장 프롬프트:", prompt?.messages[0].content);
} finally {
  await adapter.close(); // 다 쓴 뒤 연결을 닫는다
}
