// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 10 · MCP 서버 개발 (스마트몰 티켓 시스템: Tool · Resource · Prompt)
// 실행(stdio): npx tsx labs/10_ticket_mcp_server/exercise.ts
// 실행(HTTP):  npx tsx labs/10_ticket_mcp_server/solution.ts --http   → http://127.0.0.1:8000/mcp
// Inspector:   npx @modelcontextprotocol/inspector npx tsx labs/10_ticket_mcp_server/solution.ts

import { createServer } from "node:http";
import * as z from "zod";
import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { findCustomer } from "../../src/data/orders.ts";
import { findTicket, saveTicket } from "../../src/data/tickets.ts";

// 티켓 · 고객은 SQLite 파일(smartmall.sqlite)에 저장된다 — 서버를 다시 켜도 남고, 시연용 티켓 T-1001이 미리 들어 있다

// MCP 서버를 하나 만든다 (stdio · HTTP 두 방식에서 함께 쓴다)
function buildServer() {
  const server = new McpServer({ name: "tickets", version: "1.0.0" });

  // TODO 1: create_ticket 도구 — customerId · category(배송 · 환불 · 결제 · 기타) · summary를 받아 티켓을 만드세요
  //   없거나 잘못된 고객이면 isError: true로 답하고, 성공하면 "티켓 T-1002 생성"처럼 새 번호를 돌려줍니다
  // ✏️ 여기에 코드를 작성하세요

  // TODO 2: get_ticket 도구 — ticketId로 티켓 상태를 돌려주세요 (없으면 isError: true)
  // ✏️ 여기에 코드를 작성하세요

  // TODO 3: 리소스 customers://{customerId}/profile — 고객 프로필(JSON)을 읽기 전용 데이터로 제공하세요
  // ✏️ 여기에 코드를 작성하세요

  // TODO 4: 프롬프트 apology_reply — ticketId를 받아 사과 답장 작성을 요청하는 메시지를 만드세요
  // ✏️ 여기에 코드를 작성하세요

  return server;
}

if (process.argv.includes("--http")) {
  // Streamable HTTP: 요청마다 서버를 새로 만들고, 티켓 데이터는 함께 쓴다
  const mcpHandler = toNodeHandler(createMcpHandler(() => buildServer()));
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const httpServer = createServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return; // 내 PC에서 온 요청만 받는다
    mcpHandler(req, res);
  });
  httpServer.listen(8000, "127.0.0.1");
  console.error("tickets MCP 서버: http://127.0.0.1:8000/mcp");
} else {
  // stdio: stdout이 프로토콜 통로이므로 로그는 반드시 stderr(console.error)로 쓴다
  serveStdio(() => buildServer());
  console.error("tickets MCP 서버가 stdio로 시작되었습니다.");
}
