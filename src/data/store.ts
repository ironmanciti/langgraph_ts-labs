// 스마트몰 저장소 — 고객 · 상담 티켓을 SQLite 파일(smartmall.sqlite)에 보관한다
//   node:sqlite: Node.js 내장 SQLite (22.13 이상, 설치 필요 없음)
//   여러 프로세스(stdio 서버 · HTTP 서버 · 클라이언트)가 같은 파일을 함께 쓰고, 서버를 다시 켜도 티켓이 남는다
//   처음 상태로 되돌리기: npm run reset-db
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Customer } from "./orders.ts";

// 저장 위치 — SMARTMALL_DB 환경 변수로 바꿀 수 있다 (테스트는 임시 파일을 쓴다)
export const DB_PATH = process.env.SMARTMALL_DB ?? fileURLToPath(new URL("../../smartmall.sqlite", import.meta.url));

// 처음 만들 때 넣는 데이터 — 고객 3명, 시연용 티켓 T-1001
const SEED_CUSTOMERS: Customer[] = [
  { id: "C001", name: "김하늘", tier: "VIP", contact: "문자" },
  { id: "C002", name: "박준호", tier: "골드", contact: "이메일" },
  { id: "C003", name: "이서연", tier: "일반", contact: "전화" },
];

let db: DatabaseSync | undefined;

/** 저장소를 연다. 처음 부를 때 한 번만 테이블을 만들고 시드 데이터를 넣는다. */
export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA busy_timeout = 3000"); // 다른 프로세스가 쓰는 중이면 3초까지 기다린다
    init(db);
  }
  return db;
}

/** 저장소를 닫는다. 다음 getDb()가 다시 연다. */
export function closeDb(): void {
  db?.close();
  db = undefined;
}

/** 모든 티켓을 지우고 시드 데이터만 남긴다. */
export function resetDb(): void {
  const conn = getDb();
  conn.exec("DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS customers;");
  init(conn);
}

function init(conn: DatabaseSync): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id      TEXT PRIMARY KEY,
      name    TEXT NOT NULL,
      tier    TEXT NOT NULL,
      contact TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      no          INTEGER PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      category    TEXT NOT NULL,
      summary     TEXT NOT NULL,
      priority    INTEGER NOT NULL,
      status      TEXT NOT NULL
    );
  `);
  // INSERT OR IGNORE: 같은 키가 이미 있으면 건너뛴다 → 몇 번을 열어도 시드가 중복되지 않는다
  const addCustomer = conn.prepare("INSERT OR IGNORE INTO customers (id, name, tier, contact) VALUES (?, ?, ?, ?)");
  for (const c of SEED_CUSTOMERS) addCustomer.run(c.id, c.name, c.tier, c.contact);
  conn
    .prepare("INSERT OR IGNORE INTO tickets (no, customer_id, category, summary, priority, status) VALUES (?, ?, ?, ?, ?, ?)")
    .run(1001, "C001", "배송", "A100 무선 이어폰 배송 지연 문의", 2, "접수");
}
