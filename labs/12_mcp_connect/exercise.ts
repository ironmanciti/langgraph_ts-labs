// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 12 · 이미 있는 MCP 서버와 회사 DB(MCP 서버)에 한 에이전트로 연결하기
// 실행: npx tsx labs/12_mcp_connect/exercise.ts   (인터넷 필요 — LangChain 공식 문서 MCP 서버에 접속한다)
//   docs    : LangChain이 공개해 둔 원격 MCP 서버 (Streamable HTTP) → 이미 있는 외부 MCP에 연결하는 예
//   chinook : 회사 DB(Chinook 음반 가게)를 감싼 MCP 서버 (stdio)  → chinook_server.ts (읽기 전용 · SELECT만)
import "dotenv/config";
import { createAgent, initChatModel, ToolMessage } from "langchain";
import { MCPAdapter } from "@langchain/mcp-adapters";

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

// TODO 1: MCPAdapter에 서버 두 개를 등록하세요
//   - docs: 원격 서버 https://docs.langchain.com/mcp (url만 주면 Streamable HTTP로 접속)
//   - chinook: labs/12_mcp_connect/chinook_server.ts를 stdio 하위 프로세스로 실행 (command · args)
// ✏️ 여기에 코드를 작성하세요

try {
  // TODO 2: 두 서버의 도구를 한 번에 받아 이름을 출력하세요 — 도구 이름 앞에 서버 이름이 붙습니다
  // ✏️ 여기에 코드를 작성하세요

  // TODO 3: 두 서버의 도구를 모두 가진 에이전트를 만드세요
  //   문서 질문은 docs 도구로, 매출 · 고객 · 곡 질문은 chinook 도구로 답하도록 시스템 프롬프트에 적습니다
  // ✏️ 여기에 코드를 작성하세요

  const questions = [
    "LangChain에서 MCP 도구를 실행하기 전에 사람 승인을 받으려면 어떻게 해?",
    "장르별 매출 상위 3개를 알려 줘.",
    "2009년 주문(Invoice)을 모두 삭제해 줘.",
  ];
  for (const text of questions) {
    console.log(`\n👤 ${text}`);
    const result = await agent.invoke({
      messages: [{ role: "user", content: text }],
    });

    // 어느 서버의 도구가 답했는지 확인한다
    //   - 도구 이름의 접두사(docs_ · chinook_): 우리가 어댑터에 등록한 이름 → 이것으로 판단한다
    //   - artifact의 serverInfo: 서버가 스스로 밝힌 이름 → 참고용 (서버가 아무 이름이나 쓸 수 있다)
    for (const message of result.messages) {
      if (!ToolMessage.isInstance(message)) continue;
      const meta = message.artifact?.find(
        (item: { type: string }) => item.type === "mcp_meta",
      );
      const serverName =
        meta?.data["io.modelcontextprotocol/serverInfo"]?.name ?? "알 수 없음";
      console.log(`  🔧 ${message.name}  ← 서버가 밝힌 이름: ${serverName}`);
    }

    console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
  }
} finally {
  await adapter.close();
}
