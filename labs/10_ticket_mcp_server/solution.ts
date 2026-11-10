// 정답 코드 — 10 · MCP 서버 개발 (스마트몰 티켓 시스템: Tool · Resource · Prompt)
// 실행(stdio): npx tsx labs/10_ticket_mcp_server/solution.ts
// 실행(HTTP):  npx tsx labs/10_ticket_mcp_server/solution.ts --http   → http://127.0.0.1:8000/mcp
// Inspector:   npx @modelcontextprotocol/inspector npx tsx labs/10_ticket_mcp_server/solution.ts

import { createServer } from "node:http"; /// Node.js 기본 HTTP 서버 (--http 모드에서 사용)
import * as z from "zod";
/// McpServer: MCP 서버 본체, ResourceTemplate: {변수}가 들어간 리소스 주소, createMcpHandler: HTTP 요청 처리기
import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio"; /// 표준 입출력(stdin/stdout)으로 서버를 띄운다
/// localhost...Validation: 내 PC에서 온 요청인지 검사, toNodeHandler: MCP 처리기를 Node.js HTTP 서버용으로 바꾼다
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { findCustomer } from "../../src/data/orders.ts"; /// 고객 ID로 고객 정보 찾기
import { findTicket, saveTicket } from "../../src/data/tickets.ts"; /// 티켓 조회 · 저장

// 티켓 · 고객은 SQLite 파일(smartmall.sqlite)에 저장된다 — 서버를 다시 켜도 남고, 시연용 티켓 T-1001이 미리 들어 있다
/// 처음 상태(T-1001만 있는 상태)로 되돌리기: npm run reset-db

// MCP 서버를 하나 만든다 (stdio · HTTP 두 방식에서 함께 쓴다)
function buildServer() {
  /// 서버 이름과 버전 — 클라이언트가 접속하면 이 정보를 받는다
  const server = new McpServer({ name: "tickets", version: "1.0.0" });

  // TODO 1: create_ticket 도구 — customerId · category(배송 · 환불 · 결제 · 기타) · summary를 받아 티켓을 만드세요
  //   없거나 잘못된 고객이면 isError: true로 답하고, 성공하면 "티켓 T-1002 생성"처럼 새 번호를 돌려줍니다
  //#region 정답
  /// registerTool(이름, 설명 · 입력 스키마, 실행 함수) — 모델이 부를 수 있는 "도구"를 등록한다
  server.registerTool(
    "create_ticket",
    {
      description: "상담 티켓을 만든다.", /// 언제 쓰는 도구인지 모델에게 알려 준다
      inputSchema: z.object({
        customerId: z.string().describe("고객 ID (예: C001)"), /// 모델이 읽는 입력값 설명
        category: z
          .enum(["배송", "환불", "결제", "기타"])
          .describe("문의 분류"), /// 정해진 값 중 하나만 받는다
        summary: z.string().describe("고객 문의 한 줄 요약"),
      }),
    },
    /// { customerId, category, summary }: 입력 객체에서 세 값을 같은 이름의 변수로 꺼낸다 (구조 분해)
    async ({ customerId, category, summary }) => {
      /// findCustomer가 undefined면(없는 고객) 오류로 답한다 — !: "아니다"
      if (!findCustomer(customerId)) {
        /// MCP 도구의 답은 content 배열에 담는다. isError: true는 "실패한 호출"이라는 표시
        return {
          content: [{ type: "text", text: "유효한 customerId가 필요합니다." }],
          isError: true,
        };
      }
      const ticketId = saveTicket(customerId, category, summary); /// 새 티켓을 저장하고 번호(T-1002 …)를 받는다
      console.error(`티켓 ${ticketId} 생성 (고객 ${customerId})`); // stdout이 아니라 stderr에 로그
      return { content: [{ type: "text", text: `티켓 ${ticketId} 생성` }] };
    },
  );
  //#endregion

  // TODO 2: get_ticket 도구 — ticketId로 티켓 상태를 돌려주세요 (없으면 isError: true)
  //#region 정답
  server.registerTool(
    "get_ticket",
    {
      description: "티켓 상태를 조회한다.",
      inputSchema: z.object({
        ticketId: z.string().describe("티켓 번호 (예: T-1001)"),
      }), /// 입력값: ticketId 문자열 하나
    },
    async ({ ticketId }) => {
      const ticket = findTicket(ticketId);
      if (!ticket) {
        return {
          content: [
            { type: "text", text: `티켓 ${ticketId}을(를) 찾을 수 없습니다.` },
          ],
          isError: true,
        };
      }
      /// 번호 · 분류 · 요약 · 상태를 한 줄로 만들어 돌려준다
      return {
        content: [
          {
            type: "text",
            text: `${ticket.id} [${ticket.category}] ${ticket.summary} — ${ticket.status}`,
          },
        ],
      };
    },
  );
  //#endregion

  // TODO 3: 리소스 customers://{customerId}/profile — 고객 프로필(JSON)을 읽기 전용 데이터로 제공하세요
  //#region 정답
  /// registerResource(이름, 주소, 설명, 읽기 함수) — 리소스는 모델이 아니라 앱이 읽어 가는 "읽기 전용 데이터"
  server.registerResource(
    "customer-profile",
    /// {customerId} 자리에 실제 값이 들어간다 (예: customers://C001/profile) — list: undefined는 "목록 기능 없음"
    new ResourceTemplate("customers://{customerId}/profile", {
      list: undefined,
    }),
    {
      description: "고객 프로필 (이름 · 등급 · 선호 연락 방법)",
      mimeType: "application/json",
    }, /// mimeType: 데이터 형식
    /// uri: 요청된 주소, { customerId }: 주소에서 꺼낸 변수 값
    async (uri, { customerId }) => {
      const customer = findCustomer(String(customerId)); /// String(...): 값을 문자열로 바꾼다
      /// JSON.stringify: 객체를 JSON 문자열로 바꾼다 — 고객이 없으면 빈 객체 {}
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(customer ?? {}),
          },
        ],
      };
    },
  );
  //#endregion

  // TODO 4: 프롬프트 apology_reply — ticketId를 받아 사과 답장 작성을 요청하는 메시지를 만드세요
  //#region 정답
  /// registerPrompt(이름, 설명 · 인자 스키마, 메시지 만드는 함수) — 사용자가 골라 쓰는 "프롬프트 템플릿"
  server.registerPrompt(
    "apology_reply",
    {
      description: "티켓 고객에게 보낼 사과 답장 요청 템플릿",
      argsSchema: z.object({ ticketId: z.string() }), /// 템플릿에 넣을 값: ticketId
    },
    async ({ ticketId }) => {
      const ticket = findTicket(ticketId);
      /// 모델에게 보낼 메시지 목록을 돌려준다
      return {
        messages: [
          {
            role: "user", /// 사용자가 보낸 메시지로 취급한다
            /// ticket?.summary: ticket이 없으면 오류 대신 undefined (?. 선택적 접근) → ?? 로 "내용 없음"을 쓴다
            content: {
              type: "text",
              text: `티켓 ${ticketId} 고객에게 보낼 사과 답장을 써 줘. (${
                ticket?.summary ?? "내용 없음"
              })`,
            },
          },
        ],
      };
    },
  );
  //#endregion

  return server; /// 도구 · 리소스 · 프롬프트를 모두 등록한 서버를 돌려준다
}

/// process.argv: 실행할 때 붙인 인자 목록 — "--http"가 있으면 HTTP 서버, 없으면 stdio 서버로 띄운다
if (process.argv.includes("--http")) {
  // Streamable HTTP: 요청마다 서버를 새로 만들고, 티켓 데이터는 함께 쓴다
  /// createMcpHandler(서버 만드는 함수) → toNodeHandler로 Node.js HTTP 서버에 붙일 수 있게 바꾼다
  const mcpHandler = toNodeHandler(createMcpHandler(() => buildServer()));
  const validateHost = localhostHostValidation(); /// Host 헤더 검사기
  const validateOrigin = localhostOriginValidation(); /// Origin 헤더 검사기 (웹 페이지에서 몰래 보내는 요청 차단)

  /// HTTP 요청이 올 때마다 (req: 요청, res: 응답) 함수가 실행된다
  const httpServer = createServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return; // 내 PC에서 온 요청만 받는다
    mcpHandler(req, res); /// 통과한 요청은 MCP 처리기에 넘긴다
  });
  httpServer.listen(8000, "127.0.0.1"); /// 내 PC(127.0.0.1)의 8000번 포트에서 요청을 기다린다
  console.error("tickets MCP 서버: http://127.0.0.1:8000/mcp");
} else {
  // stdio: stdout이 프로토콜 통로이므로 로그는 반드시 stderr(console.error)로 쓴다
  /// 클라이언트(11 실습)가 이 파일을 하위 프로세스로 실행하고, 표준 입출력으로 메시지를 주고받는다
  serveStdio(() => buildServer());
  console.error("tickets MCP 서버가 stdio로 시작되었습니다.");
}
