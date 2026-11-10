// 스마트몰 SQLite 저장소 테스트 — 실행: npm test
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

// 실습용 smartmall.sqlite를 건드리지 않도록 임시 파일을 쓴다 (store.ts를 불러오기 전에 정해야 한다)
const dir = mkdtempSync(join(tmpdir(), "smartmall-"));
process.env.SMARTMALL_DB = join(dir, "test.sqlite");

const { closeDb, getDb, resetDb } = await import("../src/data/store.ts");
const { findTicket, listTickets, saveTicket } = await import("../src/data/tickets.ts");
const { findCustomer, findOrder } = await import("../src/data/orders.ts");

beforeEach(() => resetDb());
after(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

const count = (table: string) => (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

// 정상 케이스
test("시드: 고객 3명과 시연용 티켓 T-1001이 들어 있다", () => {
  assert.equal(count("customers"), 3);
  assert.deepEqual(findTicket("T-1001"), {
    id: "T-1001",
    customerId: "C001",
    category: "배송",
    summary: "A100 무선 이어폰 배송 지연 문의",
    priority: 2,
    status: "접수",
  });
});

test("saveTicket: 다음 번호를 돌려주고 기본 우선순위 3 · 상태 접수로 저장한다", () => {
  assert.equal(saveTicket("C002", "환불", "노트북 환불 문의"), "T-1002");
  assert.equal(saveTicket("C001", "결제", "결제 오류", 1), "T-1003");
  assert.deepEqual(findTicket("T-1002"), {
    id: "T-1002",
    customerId: "C002",
    category: "환불",
    summary: "노트북 환불 문의",
    priority: 3,
    status: "접수",
  });
});

test("listTickets: 고객의 티켓만 번호 순서로 돌려준다", () => {
  saveTicket("C002", "배송", "A103 문의");
  saveTicket("C001", "기타", "주소 변경");
  assert.deepEqual(listTickets("C001").map((t) => t.id), ["T-1001", "T-1003"]);
});

test("findCustomer: 고객 정보를 일반 객체로 돌려준다", () => {
  assert.deepEqual(findCustomer("C001"), { id: "C001", name: "김하늘", tier: "VIP", contact: "문자" });
});

test("주문 데이터는 그대로 메모리에서 읽는다", () => {
  assert.equal(findOrder("a100")?.item, "무선 이어폰");
});

// 경계값
test("findTicket: 소문자 · 앞뒤 공백을 무시한다", () => {
  assert.equal(findTicket("  t-1001 ")?.id, "T-1001");
});

test("시드 중복 방지: 저장소를 다시 열어도 시드가 늘지 않고 만든 티켓은 남는다", () => {
  saveTicket("C003", "배송", "충전기 문의");
  closeDb(); // 다시 열면 init(시드 넣기)이 한 번 더 실행된다
  assert.equal(count("customers"), 3);
  assert.equal(count("tickets"), 2);
  assert.equal(findTicket("T-1002")?.summary, "충전기 문의");
});

test("resetDb: 만든 티켓을 지우고 번호를 1002부터 다시 쓴다", () => {
  saveTicket("C001", "배송", "첫 번째");
  saveTicket("C001", "배송", "두 번째");
  resetDb();
  assert.equal(count("tickets"), 1);
  assert.equal(findTicket("T-1003"), undefined);
  assert.equal(saveTicket("C001", "배송", "초기화 뒤"), "T-1002");
});

// 실패 케이스
test("없는 티켓 · 고객은 undefined, 티켓 없는 고객은 빈 배열", () => {
  assert.equal(findTicket("T-9999"), undefined);
  assert.equal(findTicket("1001"), undefined);
  assert.equal(findCustomer("C999"), undefined);
  assert.deepEqual(listTickets("C999"), []);
});
