// 정답 코드 — 11 · MCP Client 활용 (SDK 클라이언트 → MCPAdapter → 상담 에이전트)
// 실행: npx tsx labs/11_mcp_client/solution.ts   (10 실습 서버를 stdio 하위 프로세스로 자동 실행한다)
import "dotenv/config";
import * as z from "zod";
import { Client } from "@modelcontextprotocol/client"; /// MCP 공식 SDK의 클라이언트 (
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"; /// 서버를 하위 프로세스로 띄우고 표준 입출력으로 통신한다
import { MCPAdapter } from "@langchain/mcp-adapters"; /// MCP 도구를 LangChain 도구로 바꿔 주는 어댑터
import { createAgent, initChatModel, tool } from "langchain"; /// 에이전트 만들기 · 도구 만들기
import { findOrder } from "../../src/data/orders.ts"; /// 주문번호로 주문 찾기

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

// 10 실습 서버를 실행하는 명령 (프로젝트 폴더에서 실행한다고 가정)
/// 터미널에서 node --import tsx labs/10_ticket_mcp_server/solution.ts 를 실행하는 것과 같다
const ticketServer = {
  command: "node", /// 실행할 프로그램
  args: ["--import", "tsx", "labs/10_ticket_mcp_server/solution.ts"], /// 프로그램에 넘길 인자 (tsx: TypeScript를 바로 실행)
};

// ─── 1. SDK 클라이언트로 MCP 수명 주기 직접 체험하기 ───
console.log("=== 1. SDK 클라이언트 ===");
/// 클라이언트 이름과 버전 — 서버가 "누가 접속했는지" 알 수 있게 한다
const client = new Client({ name: "support-agent", version: "1.0.0" });

// TODO 1: connect → readResource(customers://C001/profile) → close
//   connect 뒤의 작업은 try에, close는 finally에 둡니다 (중간에 오류가 나도 연결을 닫는다)
//#region 정답
/// 서버 실행
await client.connect(new StdioClientTransport(ticketServer)); // initialize 핸드셰이크
try {
  /// 리소스 주소(uri)로 읽기 전용 데이터를 가져온다
  const profile = await client.readResource({
    uri: "customers://C001/profile",
  });
  console.log("고객 프로필:", profile.contents);
} finally {
  await client.close(); /// 연결을 닫는다 — 하위 프로세스(서버)도 함께 끝난다
}
//#endregion

// ─── 2. MCPAdapter: MCP 도구를 LangChain 도구로 바꿔 에이전트에 연결하기 ───
console.log("\n=== 2. MCPAdapter + 상담 에이전트 ===");

/// 로컬 도구 — MCP 도구와 섞어서 에이전트에 줄 수 있다
const getOrderStatus = tool(
  async ({ orderId }) => {
    const order = findOrder(orderId); /// 없으면 undefined
    if (!order) return `주문 ${orderId}을(를) 찾을 수 없습니다.`;
    return `${order.id} ${order.item}: ${order.status} (${order.eta})`; /// 템플릿 문자열로 한 줄 만들기
  },
  {
    name: "get_order_status",
    description: "주문번호로 주문 상태를 조회한다.",
    schema: z.object({ orderId: z.string().describe("주문번호 (예: A100)") }),
  },
);

// TODO 2: MCPAdapter에 티켓 서버를 tickets라는 이름으로 등록하세요
//#region 정답
/// servers: { 서버 이름: 접속 방법 } — 여러 서버를 한 번에 등록할 수 있다 (만들 때는 아직 접속하지 않는다)
const adapter = new MCPAdapter({
  servers: {
    tickets: ticketServer, /// "tickets"라는 이름으로 10 실습 서버(stdio)를 등록
    // 원격 서버도 함께 연결할 수 있다: remote: { url: "http://127.0.0.1:8000/mcp" }
  },
});
//#endregion

// 에이전트가 MCP 도구를 쓰는 동안 어댑터를 열어 두고, 다 쓰면 finally에서 닫는다
try {
  /// 서버에 접속해 도구 목록을 받아 LangChain 도구 배열로 돌려준다
  const mcpTools = await adapter.listTools(); // 이름 앞에 서버 이름이 붙는다 (tickets_create_ticket …)
  console.log(
    "MCP 도구:",
    mcpTools.map((t) => t.name),
  ); /// 바뀐 도구 이름 확인

  // TODO 3: 로컬 도구(getOrderStatus)와 MCP 도구를 함께 쓰는 상담 에이전트를 만들고 실행하세요
  //#region 정답
  const agent = createAgent({
    model,
    /// ...mcpTools: 배열을 펼쳐서 하나씩 넣는다 (spread) → [getOrderStatus, 도구1, 도구2, ...]
    tools: [getOrderStatus, ...mcpTools],
    /// 문자열이 길어서 + 로 두 줄을 이어 붙였다
    systemPrompt:
      "너는 스마트몰 고객지원 상담원이야. 주문은 get_order_status로 확인하고, 상담 티켓은 tickets_create_ticket으로 만들어. " +
      "현재 고객 ID: C001",
  });

  /// 사용자 메시지를 넣어 실행하고, 끝날 때까지 기다린다
  const result = await agent.invoke({
    messages: [
      { role: "user", content: "A100 배송 지연으로 티켓 만들어 주세요" },
    ],
  });
  /// 대화에 쌓인 메시지를 차례로 출력한다 (human → ai → tool → ai)
  for (const message of result.messages) {
    console.log(`[${message.type}] ${message.text}`);
  }
  //#endregion

  // 리소스 · 프롬프트도 어댑터로 가져올 수 있다
  /// readResource(서버 이름, 리소스 주소)
  console.log(
    "\n고객 프로필:",
    await adapter.readResource("tickets", "customers://C001/profile"),
  );
  /// 어댑터 안에 있는 SDK 클라이언트를 꺼낸다 — 없을 수도 있어서 결과가 undefined일 수 있다
  const ticketsClient = await adapter.getClient("tickets");
  /// ticketsClient?.getPrompt: 클라이언트가 있을 때만 호출한다 (?. 선택적 호출)
  const prompt = await ticketsClient?.getPrompt({
    name: "apology_reply",
    arguments: { ticketId: "T-1001" },
  });
  console.log("사과 답장 프롬프트:", prompt?.messages[0].content); /// 첫 번째 메시지의 내용
} finally {
  await adapter.close(); // 다 쓴 뒤 연결을 닫는다
}
