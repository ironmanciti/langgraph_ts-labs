# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요
LangGraph.js v1(TypeScript) 교육용 실습 저장소. 가상 쇼핑몰 "스마트몰" 고객지원 에이전트를 실습(`labs/NN_주제/`)마다 기능을 하나씩 더해 가며 만든다. 코드 모양은 LangChain 공식 JS 문서 예제를 따르고, 주석·문자열은 한국어다. ESM(`"type": "module"`), Node 22.13 이상(`node:sqlite` 사용), 빌드 없이 `tsx`로 바로 실행한다.

## 명령어
```bash
npx tsx labs/04_self_check/solution.ts     # 실습 하나 실행 (exercise.ts = 학생용 빈칸 버전)
npm run typecheck                          # tsc --noEmit (labs/**/exercise.ts는 빈칸이 있어 제외)
npm test                                   # node:test + tsx, tests/**/*.test.ts
node --import tsx --test tests/store.test.ts   # 테스트 파일 하나만
npm run dev                                # LangGraph Studio 개발 서버 (langgraph.json, :2024)
npm run make-exercises                     # solution.ts → exercise.ts 재생성
npm run reset-db                           # smartmall.sqlite를 시드 상태(티켓 T-1001)로 초기화
npm run start:deploy                       # 13 Express 서버 (:3000)
npm run check-keys                         # .env API 키를 회사별 값싼 모델로 점검 (실패 시 exit 1)
```
린터 스크립트는 없다.

## 구조에서 알아야 할 점
- **solution.ts가 원본, exercise.ts는 생성물.** `scripts/make-exercises.mjs`가 `//#region 정답` ~ `//#endregion` 구간을 `// ✏️ 여기에 코드를 작성하세요`로 바꾸고, `///` 주석(초보자용 줄별 설명)을 지운다. exercise.ts를 직접 고치지 말고 solution.ts를 고친 뒤 재생성한다. 00은 빈칸이 없어 solution.ts만 있다.
- **각 실습 파일은 독립 실행 스크립트다.** 모델은 `.env`의 `MODEL` 값(`provider:model` 형식, 해당 회사 키 필요)으로 정하고, 각 파일 맨 위 `const MODEL = process.env.MODEL ?? "openai:gpt-6-luna"`가 이를 읽는다(없으면 기본값). 도구는 실습마다 파일 안에 다시 정의하는 경우가 많다(학습용 중복).
- **Studio 연결:** `langgraph.json`의 그래프 이름은 `실습번호_이름`(예: `02_agent_graph`, `13_support`)이고 각 `labs/*/studio.ts`(13은 `agent.ts`)의 `graph` export를 가리킨다. studio.ts는 solution.ts와 같은 그래프를 체크포인터 없이 export한다. 그래프 이름을 바꾸면 studio.ts 첫 줄 주석과 README도 함께 고친다. 개발 서버 상태는 `.langgraph_api/`에 남으므로, 이름을 바꾼 뒤 예전 그래프가 계속 보이면 서버를 끄고 이 폴더를 지운다.
- **공유 데이터(`src/data/`):** `orders.ts`(주문·택배·고객 조회, 메모리), `tickets.ts`(티켓·환불), `store.ts`(SQLite `smartmall.sqlite` — 10 · 11 MCP 실습에서 여러 프로세스가 함께 쓴다. `SMARTMALL_DB` 환경 변수로 경로를 바꿀 수 있고 테스트는 임시 파일을 쓴다), `policies/*.md`(RAG용 정책 문서).
- **`src/support-tools.ts`:** 08a~08d 멀티 에이전트 실습이 함께 쓰는 도구(`get_order_status`, `track_shipment`, `search_policy`).
- **임베딩:** `OpenAIEmbeddings`만 쓴다(정책 검색 실습은 MODEL과 상관없이 OpenAI 키 필요).
- **13 배포:** `labs/13_deploy/agent.ts`는 `createSupportAgent(checkpointer)`로 고객 상담 챗봇(도구 3개: 주문 · 배송 · 정책 문서 읽기, 임베딩 없음)을 만들고, `solution.ts`는 그 에이전트로 Express 서버(`POST /api/chat` 하나 + 채팅 화면)를 여는 위에서 아래로 읽히는 스크립트다(접근 토큰 · 승인 흐름 없음 — 강의 후 API 키를 폐기하는 전제로 단순화). `labs/13_deploy`는 혼자 배포되는 폴더다: 자체 `package.json`(start: tsx solution.ts) · `.gitignore` · `data/`(orders.ts · policies/*.md 복사본)를 가지며 `../../src`를 import하지 않는다. 수강생은 이 폴더만 GitHub에 올려 Render(Build `npm install`, Start `npm start`)에 배포한다.
- **10~12 MCP:** 11은 10 서버를 stdio로 자동 실행한다(10의 `--http`는 HTTP 확인용). 12는 원격 LangChain 문서 MCP(`https://docs.langchain.com/mcp`, 인터넷 필요)와 `labs/12_mcp_connect/chinook_server.ts`(`src/data/Chinook.db`를 읽기 전용으로 여는 사내 DB 예제 서버, solution.ts가 stdio로 자동 실행)를 한 에이전트에 연결한다. chinook_server.ts는 생성 대상이 아니라 완성본이다.
