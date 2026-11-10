// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts) — 13 · 고객 상담 챗봇 배포 (Express 서버 + 채팅 화면 → Render)
// 실행(로컬):   npx tsx labs/13_deploy/exercise.ts   → http://localhost:3000   (.env에 OPENAI_API_KEY 필요)
// 배포:         이 폴더(labs/13_deploy)만 GitHub 저장소로 올린다 — 필요한 패키지 · 데이터가 모두 이 안에 있다
//   Render:     Build Command  npm install
//               Start Command  npm start          (이 폴더의 package.json → tsx solution.ts)
//               Environment    OPENAI_API_KEY     (PORT는 Render가 정해 준다)
//
//   POST /api/chat   { threadId, message }  → { answer }
//   GET  /           public/index.html (채팅 화면)
import "dotenv/config";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { MemorySaver } from "@langchain/langgraph";
import { createSupportAgent } from "./agent.ts";

const agent = createSupportAgent(new MemorySaver());
const app = express();
app.use(express.json());
app.use(express.static(path.join(import.meta.dirname, "public")));

// TODO 1: POST /api/chat — threadId · message를 받아 같은 thread로 에이전트를 실행하고 { answer }를 돌려주세요
//   message가 비었거나 500자를 넘으면 400으로 답합니다 (공개 주소라 긴 질문으로 요금이 나가지 않게)
// ✏️ 여기에 코드를 작성하세요

// TODO 2: 포트는 PORT 환경 변수(Render가 정해 준다)를 쓰고, 없으면 3000으로 서버를 여세요
// ✏️ 여기에 코드를 작성하세요
