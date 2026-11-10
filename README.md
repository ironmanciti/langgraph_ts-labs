# LangGraph를 활용한 AI Agent 개발하기 — TypeScript 실습

이 과정은 VS Code에서 TypeScript로 진행합니다. 가상 쇼핑몰 **스마트몰의 고객지원 에이전트**를 처음 만들고, 실습마다 기능을 하나씩 더해 갑니다. 코드는 LangChain 공식 JavaScript 문서(LangGraph.js v1)의 예제 모양을 따릅니다.

## 1. 준비
| 항목 | 버전 |
|---|---|
| Node.js | 22 이상 (24 LTS 권장) — <https://nodejs.org> |
| VS Code | 최신 버전 |
| API 키 | OpenAI · Anthropic · Google 중 하나 |

```bash
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

**`.env`에는 API 키와 사용할 모델을 넣습니다.**
```ini
OPENAI_API_KEY=...          # 사용하는 회사의 키만 있으면 된다
MODEL=openai:gpt-6-luna     # provider:model 형식
```

**모델은 `.env`의 `MODEL` 값으로 바꿉니다.** 비싼 모델과 싼 모델을 바꿔 가며 결과를 비교해 보세요. 각 실습 파일 맨 위는 다음과 같이 `.env` 값을 읽고, 값이 없으면 기본 모델을 씁니다.
```ts
// 사용할 모델 — .env의 MODEL 값을 쓰고, 없으면 기본 모델을 쓴다 (예: "anthropic:claude-haiku-4-5", "google:gemini-3.6-flash")
const MODEL = process.env.MODEL ?? "openai:gpt-6-luna";
```
`.env`의 API 키가 회사별로 동작하는지 한 번에 확인하려면 `npm run check-keys`를 실행합니다. (키가 없는 회사는 건너뜁니다)

**임베딩(정책 검색):** OpenAI 임베딩을 쓰므로, 정책 검색이 들어간 실습(03 · 04 · 08a · 08b · 08d)은 `MODEL`을 다른 회사로 바꿔도 `OPENAI_API_KEY`가 필요합니다.

## 2. 실습 진행 방법
각 실습 폴더에는 `exercise.ts`(실습 문제)와 `solution.ts`(정답)가 있습니다. 00은 빈칸 없이 함께 실행하는 예제라 `solution.ts`만 있습니다. 강사와 함께 `exercise.ts`의 `// ✏️ 여기에 코드를 작성하세요` 자리를 채우고 실행해 결과를 확인합니다. 막히면 Claude Code나 Codex에게 물어보며 해결합니다.

```bash
npx tsx labs/04_self_check/exercise.ts      # 내 코드 실행 (VS Code: F5 → "현재 실습 파일 실행")
npx tsx labs/04_self_check/solution.ts      # 정답 실행
```

## 3. 실습 목록
| 순서 | 실습 | 에이전트에 붙는 기능 | 핵심 API |
|---|---|---|---|
| 00 | `00_first_agent` | 첫 상담 에이전트 + 주문 조회 도구 (함께 실행 · API 키 점검) | `createAgent`, `tool` |
| 02 | `02_agent_graph` | agent ⇄ tools 그래프 직접 조립 · invoke와 stream의 출력 방식 비교 | `StateGraph`, `ToolNode`, `toolsCondition`, `stream` (updates · messages) |
| 03 | `03_RAG_agent` | 정책 문서 검색 도구 `search_policy` + RAG 에이전트 + 구조화 응답 | 텍스트 분할, `MemoryVectorStore`, `asRetriever`, `responseFormat` |
| 04 | `04_self_check` | 답변 근거 검증 노드 + 재시도 한도 | `withStructuredOutput`, `Command` |
| 07 | `07_memory` | 체크포인터 있고 없음 비교 · thread_id로 대화 이어가기 · 장기 메모리 · 시점 되돌리기(replay · fork) (도구 없는 단순 그래프) | `MemorySaver`, `InMemoryStore`, `thread_id`, `context`, `getStateHistory`, `updateState` |
| 08a | `08a_subagents` | 멀티 에이전트 ① Subagents — 상담 총괄 + 전문 에이전트 3개 | 에이전트를 도구로 감싸기 |
| 08b | `08b_handoffs` | 멀티 에이전트 ② Handoffs — 상담원끼리 대화 넘기기 | `Command` (`goto` · `Command.PARENT`), `MemorySaver` |
| 08c | `08c_skills` | 멀티 에이전트 ③ Skills — 필요한 정책 문서만 불러오기 | `createMiddleware` (`wrapModelCall`), `load_skill` |
| 08d | `08d_router` | 멀티 에이전트 ④ Router — 분류 · 동시 실행 · 결과 합치기 | `withStructuredOutput`, `Send`, `ReducedValue` |
| 09 | `09_refund_approval` | 환불 승인 · 수정 · 거절 | `humanInTheLoopMiddleware` |
| 10 | `10_ticket_mcp_server` | 티켓 시스템 MCP 서버 | `McpServer` (Tool · Resource · Prompt) |
| 11 | `11_mcp_client` | 상담 에이전트에 MCP 도구 연결 | `Client`, `MCPAdapter` |
| 12 | `12_mcp_connect` | 이미 있는 외부 MCP(LangChain 공식 문서) + 회사 DB(Chinook) MCP 서버를 한 에이전트에 연결 — DB는 읽기 전용 · SELECT만 | `MCPAdapter` (url · stdio 서버 여러 개) |
| 13 | `13_deploy` | 고객 상담 챗봇을 Express 서버로 감싸 Render에 배포 | `express`, `MemorySaver` |

**실습 순서별 안내**
- **02:** `npm run dev`를 실행하고 Studio에서 `02_agent_graph`를 고르면, 같은 그래프를 화면으로 볼 수 있습니다. 끌 때는 터미널에서 `Ctrl+C`를 누릅니다.
- **08a~08d:** `npm run dev` 후 Studio에서 `08a_subagents` · `08b_handoffs` · `08c_skills` · `08d_router`를 고르면 패턴별 흐름을 화면으로 볼 수 있습니다. (`08b_handoffs`는 같은 thread에서 이어 물어보면 마지막 상담원이 바로 받습니다)
- **09:** Studio에서 `09_refund_approval`을 고르고 환불을 요청하면 `refund_order` 직전에 멈춥니다. 화면에서 승인 · 수정 · 거절을 골라 이어 갈 수 있습니다.
- **10 · 11:** 11은 10 서버를 stdio 하위 프로세스로 자동 실행합니다. 10을 HTTP로 띄우려면 `npx tsx labs/10_ticket_mcp_server/solution.ts --http` (http://127.0.0.1:8000/mcp).
- **12:** 인터넷이 필요합니다(LangChain 공식 문서 MCP 서버). 회사 DB 역할의 Chinook 서버(`labs/12_mcp_connect/chinook_server.ts`)는 실습 파일이 자동으로 띄웁니다.
- **10 · 11 티켓:** 티켓은 `smartmall.sqlite`에 남아 실행할수록 번호가 늘어납니다. `npm run reset-db`로 T-1001만 있는 처음 상태로 되돌립니다.
- **13:** `npm run start:deploy` → http://localhost:3000 채팅 화면에서 질문합니다.
- **13 → Render:** `labs/13_deploy` 폴더만 GitHub 저장소로 올립니다(이 폴더에 자체 `package.json` · 데이터가 있어 혼자 실행됨). Render New → Web Service → Build Command `npm install`, Start Command `npm start`, Environment에 `OPENAI_API_KEY`. 공개 주소라 누구나 쓸 수 있으니 강의가 끝나면 API 키를 폐기합니다. 무료 플랜은 15분 동안 요청이 없으면 잠들고, 재시작하면 대화가 초기화됩니다.

## 4. 폴더 구조
```
langgraph-ts-labs/
├── labs/<번호_주제>/          # exercise.ts(실습 문제) · solution.ts(정답) — 00은 함께 실행하는 예제
├── src/data/                  # 스마트몰 가상 데이터
│   ├── orders.ts              #   주문 10건 · 택배 위치 · 고객 조회
│   ├── tickets.ts             #   상담 티켓 · 환불 기록
│   ├── store.ts               #   SQLite 저장소 (고객 3명 · 티켓 → smartmall.sqlite)
│   ├── policies.ts            #   정책 문서 읽기
│   ├── policies/*.md          #   배송 · 환불 · 회원 · 결제 · 제품 FAQ
│   └── Chinook.db             #   12 실습용 샘플 DB (음반 가게: 고객 · 주문 · 곡 · 장르)
├── src/support-tools.ts       # 08a~08d가 함께 쓰는 상담 도구 (주문 조회 · 배송 조회 · 정책 검색)
├── scripts/                   # reset-db.ts(티켓 초기화) · make-exercises.mjs(강사용)
├── tests/                     # 저장소 · 배포 서버 테스트 (npm test)
└── langgraph.json             # Studio(npm run dev) 설정 (그래프 이름 = 실습 번호_이름: 02_agent_graph, 04_self_check, 08a~08d, 09_refund_approval, 13_support)
```

## 5. Python → TypeScript 대응표
| Python | TypeScript |
|---|---|
| `class State(TypedDict)` / `MessagesState` | `new StateSchema({ ... })` / `messages: MessagesValue` |
| `Annotated[list, operator.add]` | `new ReducedValue(z.array(...).default(() => []), { reducer })` |
| `builder.add_node / add_edge / add_conditional_edges` | `.addNode / .addEdge / .addConditionalEdges` (체이닝) |
| `@tool` + docstring + 타입 힌트 | `tool(fn, { name, description, schema: z.object(...) })` |
| `llm.bind_tools()` / `with_structured_output()` | `model.bindTools()` / `model.withStructuredOutput(zodSchema)` |
| `InMemorySaver()` | `new MemorySaver()` |
| `graph.get_state_history(cfg)` | `for await (const s of graph.getStateHistory(cfg))` |
| `interrupt()` / `Command(resume=...)` | `interrupt()` / `new Command({ resume })` |
| `create_agent(model, tools, system_prompt=)` | `createAgent({ model, tools, systemPrompt })` |
| `FastMCP` · `@mcp.tool()` | `new McpServer()` · `server.registerTool()` (MCP SDK v2) |
| `MultiServerMCPClient` · `get_tools()` | `new MCPAdapter({ servers })` · `listTools()` |
| `langgraph dev` | `npm run dev` (`npx @langchain/langgraph-cli dev`) |

## 6. 강사용
- `solution.ts`의 `//#region 정답` ~ `//#endregion` 구간이 학생용 빈칸이 됩니다.
- `solution.ts`의 `///` 주석은 초보자용 줄별 설명입니다. `exercise.ts`에서는 빠지므로 실습 문제는 깔끔하게 유지됩니다.
- 정답을 고친 뒤 `npm run make-exercises`를 실행하면 `exercise.ts`가 다시 만들어집니다.
- `npm run typecheck`로 정답 코드의 타입을 검사합니다. 실습 문제 파일은 빈칸이 있어서 검사에서 뺍니다.
