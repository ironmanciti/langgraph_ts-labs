// 사내 DB를 MCP 서버로 감싸기 — Chinook(음반 가게 샘플 DB: 고객 · 주문 · 곡 · 장르)
// solution.ts가 이 파일을 stdio 하위 프로세스로 실행합니다.
// 직접 확인: npx @modelcontextprotocol/inspector npx tsx labs/12_mcp_connect/chinook_server.ts
import { DatabaseSync } from "node:sqlite"; // Node.js 기본 SQLite
import { fileURLToPath } from "node:url";
import * as z from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const DB_PATH = fileURLToPath(
  new URL("../../src/data/Chinook.db", import.meta.url),
);
const MAX_ROWS = 50; // 한 번에 돌려줄 최대 행 수

const db = new DatabaseSync(DB_PATH, { readOnly: true }); // 1. 읽기 전용

// 실제로 있는 테이블 이름 목록 (sqlite_ 로 시작하는 내부 테이블은 뺀다)
const TABLES = (
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[]
).map((row) => row.name);

// 행 목록을 "열 | 열" 모양의 글로 바꾼다
function toText(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "결과가 없습니다.";
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(" | ")];
  for (const row of rows)
    lines.push(columns.map((c) => String(row[c])).join(" | "));
  return lines.join("\n");
}

function buildServer() {
  const server = new McpServer({ name: "chinook", version: "1.0.0" });

  server.registerTool(
    "list_tables",
    {
      description: "Chinook DB의 테이블 이름 목록을 돌려준다.",
      inputSchema: z.object({}),
    },
    async () => ({ content: [{ type: "text", text: TABLES.join(", ") }] }),
  );

  server.registerTool(
    "describe_table",
    {
      description:
        "테이블의 열 이름과 타입을 돌려준다. SQL을 쓰기 전에 먼저 확인한다.",
      inputSchema: z.object({
        table: z.string().describe("테이블 이름 (예: Invoice)"),
      }),
    },
    async ({ table }) => {
      if (!TABLES.includes(table)) {
        // 4. 목록에 있는 이름만 받는다
        return {
          content: [
            {
              type: "text",
              text: `없는 테이블입니다. 고를 수 있는 테이블: ${TABLES.join(
                ", ",
              )}`,
            },
          ],
          isError: true,
        };
      }
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as {
        name: string;
        type: string;
      }[];
      return {
        content: [
          {
            type: "text",
            text: columns.map((c) => `${c.name} ${c.type}`).join("\n"),
          },
        ],
      };
    },
  );

  server.registerTool(
    "run_select",
    {
      description: `SELECT 문 하나를 실행하고 결과를 최대 ${MAX_ROWS}행까지 돌려준다. 데이터를 바꾸는 문장은 실행하지 않는다.`,
      inputSchema: z.object({ sql: z.string().describe("실행할 SELECT 문") }),
    },
    async ({ sql }) => {
      const query = sql.trim().replace(/;\s*$/, ""); // 끝의 ; 하나는 허용
      // 2. SELECT(또는 WITH로 시작하는 조회) 한 문장만 받는다
      if (!/^(select|with)\b/i.test(query) || query.includes(";")) {
        return {
          content: [
            { type: "text", text: "SELECT 문 하나만 실행할 수 있습니다." },
          ],
          isError: true,
        };
      }
      try {
        const rows = db.prepare(query).all() as Record<string, unknown>[];
        const shown = rows.slice(0, MAX_ROWS); // 3. 행 수 제한
        const note =
          rows.length > MAX_ROWS
            ? `\n(전체 ${rows.length}행 중 ${MAX_ROWS}행만 표시)`
            : "";
        return { content: [{ type: "text", text: toText(shown) + note }] };
      } catch (error) {
        // 읽기 전용 DB에 쓰려 하거나 SQL이 틀리면 여기로 온다
        return {
          content: [
            { type: "text", text: `SQL 오류: ${(error as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

// stdio: stdout은 MCP 통신 전용이므로 로그는 console.error로 쓴다
serveStdio(() => buildServer());
console.error(
  `chinook MCP 서버가 stdio로 시작되었습니다. (테이블 ${TABLES.length}개, 읽기 전용)`,
);
