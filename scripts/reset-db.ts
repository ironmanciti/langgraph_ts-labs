// 스마트몰 저장소를 처음 상태로 되돌린다 (만든 티켓을 모두 지우고 고객 3명 · 티켓 T-1001만 남긴다)
// 실행: npm run reset-db   (실행 중인 MCP 서버가 있으면 먼저 끈다)
import { DB_PATH, closeDb, resetDb } from "../src/data/store.ts";

resetDb();
closeDb();
console.log(`저장소를 초기화했습니다: ${DB_PATH}`);
