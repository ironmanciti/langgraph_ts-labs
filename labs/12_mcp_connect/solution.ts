// 정답 코드 — 12 · 이미 있는 MCP 서버와 회사 DB(MCP 서버)에 한 에이전트로 연결하기
// 실행: npx tsx labs/12_mcp_connect/solution.ts   (인터넷 필요 — LangChain 공식 문서 MCP 서버에 접속한다)
//   docs    : LangChain이 공개해 둔 원격 MCP 서버 (Streamable HTTP) → 이미 있는 외부 MCP에 연결하는 예
//   chinook : 회사 DB(Chinook 음반 가게)를 감싼 MCP 서버 (stdio)  → chinook_server.ts (읽기 전용 · SELECT만)
import "dotenv/config"; /// .env의 API 키를 읽는다
import { createAgent, initChatModel, ToolMessage } from "langchain"; /// 에이전트 만들기 · 도구 결과 메시지
import { MCPAdapter } from "@langchain/mcp-adapters"; /// MCP 서버의 도구를 LangChain 도구로 바꿔 준다

const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";

const model = await initChatModel(MODEL, { useResponsesApi: true });

// TODO 1: MCPAdapter에 서버 두 개를 등록하세요
//   - docs: 원격 서버 https://docs.langchain.com/mcp (url만 주면 Streamable HTTP로 접속)
//   - chinook: labs/12_mcp_connect/chinook_server.ts를 stdio 하위 프로세스로 실행 (command · args)
//#region 정답
const adapter = new MCPAdapter({
  servers: {
    docs: { url: "https://docs.langchain.com/mcp" }, /// 이미 있는 외부 MCP — 주소만 알면 된다
    /// node --import tsx 파일: TypeScript 파일을 바로 실행한다
    chinook: {
      command: "node",
      args: ["--import", "tsx", "labs/12_mcp_connect/chinook_server.ts"],
    },
  },
});
//#endregion

try {
  // TODO 2: 두 서버의 도구를 한 번에 받아 이름을 출력하세요 — 도구 이름 앞에 서버 이름이 붙습니다
  //#region 정답
  const tools = await adapter.listTools(); /// 등록한 모든 서버의 도구를 LangChain 도구 배열로 받는다
  console.log(
    "MCP 도구:",
    tools.map((t) => t.name),
  ); /// docs_… · chinook_list_tables · chinook_run_select …
  //#endregion

  // TODO 3: 두 서버의 도구를 모두 가진 에이전트를 만드세요
  //   문서 질문은 docs 도구로, 매출 · 고객 · 곡 질문은 chinook 도구로 답하도록 시스템 프롬프트에 적습니다
  //#region 정답
  const agent = createAgent({
    model,
    tools, /// { tools: tools }를 줄여 쓴 것
    systemPrompt:
      "너는 사내 개발 · 데이터 도우미야. 한국어로 짧게 답해.\n" +
      "- LangChain · LangGraph 사용법 질문: docs 도구로 공식 문서를 찾아 근거와 함께 답한다.\n" +
      "- 매출 · 고객 · 곡 · 장르 질문: chinook 도구로 테이블 구조를 먼저 확인한 뒤 SELECT로 조회해 답한다.",
  });
  //#endregion

  /// 세 번째 질문은 데이터를 지우라는 요청 — 서버가 SELECT만 받으므로 실행되지 않는 것을 확인한다
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
      if (!ToolMessage.isInstance(message)) continue; /// 도구 결과 메시지만 본다 (continue: 다음 메시지로 건너뛴다)
      /// artifact: 결과에 함께 실려 온 부가 정보 목록 — type이 "mcp_meta"인 칸에 서버 정보가 들어 있다
      const meta = message.artifact?.find(
        (item: { type: string }) => item.type === "mcp_meta",
      );
      const serverName =
        meta?.data["io.modelcontextprotocol/serverInfo"]?.name ?? "알 수 없음";
      console.log(`  🔧 ${message.name}  ← 서버가 밝힌 이름: ${serverName}`);
    }

    /// 마지막 메시지 = 최종 답변 (배열의 마지막 칸: 길이 - 1)
    console.log(`🤖 ${result.messages[result.messages.length - 1].text}`);
  }
} finally {
  await adapter.close(); /// MCP 연결을 닫는다
}
