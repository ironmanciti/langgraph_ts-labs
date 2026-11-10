// 정답 코드 — 13 · 고객 상담 챗봇 배포 (Express 서버 + 채팅 화면 → Render)
// 실행(로컬):   npx tsx labs/13_deploy/solution.ts   → http://localhost:3000   (.env에 OPENAI_API_KEY 필요)
// 배포:         이 폴더(labs/13_deploy)만 GitHub 저장소로 올린다 — 필요한 패키지 · 데이터가 모두 이 안에 있다
//   Render:     Build Command  npm install
//               Start Command  npm start          (이 폴더의 package.json → tsx solution.ts)
//               Environment    OPENAI_API_KEY     (PORT는 Render가 정해 준다)
//
//   POST /api/chat   { threadId, message }  → { answer }
//   GET  /           public/index.html (채팅 화면)
/// (/// 로 시작하는 주석은 정답 파일에만 있는 줄별 설명입니다. exercise.ts에는 나오지 않습니다)
import "dotenv/config"; /// .env의 API 키를 읽는다 (Render에서는 Environment 화면의 값이 쓰인다)
import path from "node:path"; /// 폴더 · 파일 경로를 이어 붙이는 Node.js 기본 기능
import express, { type Request, type Response } from "express"; /// 웹 서버 프레임워크
import { MemorySaver } from "@langchain/langgraph"; /// 대화를 메모리에 저장하는 체크포인터
import { createSupportAgent } from "./agent.ts"; /// 배포할 고객 상담 챗봇

const agent = createSupportAgent(new MemorySaver()); /// 대화를 메모리에 저장 (서버를 다시 켜면 초기화)
const app = express(); /// 웹 서버(앱)를 만든다
app.use(express.json()); /// 요청 본문(JSON)을 req.body 객체로 바꿔 준다
app.use(express.static(path.join(import.meta.dirname, "public"))); /// public 폴더의 채팅 화면을 그대로 보여 준다

// TODO 1: POST /api/chat — threadId · message를 받아 같은 thread로 에이전트를 실행하고 { answer }를 돌려주세요
//   message가 비었거나 500자를 넘으면 400으로 답합니다 (공개 주소라 긴 질문으로 요금이 나가지 않게)
//#region 정답
app.post("/api/chat", async (req: Request, res: Response) => {
  const { threadId, message } = req.body ?? {}; /// 본문에서 두 값을 꺼낸다 (본문이 없으면 빈 객체)
  /// typeof x !== "string": 글자가 아니면 (없거나 다른 모양이면) 잘못된 요청
  if (typeof threadId !== "string" || typeof message !== "string" || !message.trim() || message.length > 500) {
    res.status(400).json({ error: "threadId와 message(500자 이내)가 필요합니다." }); /// 400: 요청이 잘못됨
    return;
  }
  const result = await agent.invoke(
    { messages: [{ role: "user", content: message }] },
    { configurable: { thread_id: threadId } }, /// 같은 threadId = 같은 대화방 → 앞 대화를 기억한다
  );
  res.json({ answer: result.messages[result.messages.length - 1].text }); /// 마지막 메시지 = 챗봇의 답
});
//#endregion

// TODO 2: 포트는 PORT 환경 변수(Render가 정해 준다)를 쓰고, 없으면 3000으로 서버를 여세요
//#region 정답
const port = Number(process.env.PORT ?? 3000); /// ??: 왼쪽 값이 없으면 오른쪽 값 (환경 변수는 글자라서 Number로 바꾼다)
app.listen(port, () => console.log(`상담 챗봇: http://localhost:${port}`)); /// 서버가 열리면 주소를 출력한다
//#endregion
