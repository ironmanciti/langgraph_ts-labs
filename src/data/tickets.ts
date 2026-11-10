// 상담 티켓 · 환불 기록 — 티켓은 SQLite 저장소(store.ts)에 보관한다
import { getDb } from "./store.ts";

export interface Ticket {
  id: string;
  customerId: string;
  category: string; // 배송 · 환불 · 결제 · 기타
  summary: string;
  priority: number; // 1: 긴급 ~ 3: 일반
  status: string; // 접수 · 처리 중 · 완료
}

// 티켓 행을 Ticket 모양으로 꺼낸다 (번호 1001 → "T-1001")
const SELECT_TICKET = `SELECT 'T-' || no AS id, customer_id AS customerId, category, summary, priority, status FROM tickets`;

/** 티켓을 만들고 번호(T-1001 …)를 돌려준다. */
export function saveTicket(customerId: string, category: string, summary: string, priority = 3): string {
  // 마지막 번호 + 1 (티켓이 없으면 1001부터)
  const row = getDb()
    .prepare(
      `INSERT INTO tickets (no, customer_id, category, summary, priority, status)
       VALUES ((SELECT COALESCE(MAX(no), 1000) + 1 FROM tickets), ?, ?, ?, ?, '접수') RETURNING no`,
    )
    .get(customerId, category, summary, priority) as { no: number };
  return `T-${row.no}`;
}

/** 티켓 번호로 티켓을 찾는다. */
export function findTicket(ticketId: string): Ticket | undefined {
  const id = ticketId.trim().toUpperCase();
  const row = getDb().prepare(`${SELECT_TICKET} WHERE 'T-' || no = ?`).get(id);
  return row ? ({ ...row } as unknown as Ticket) : undefined; // { ...row }: SQLite 행을 일반 객체로 복사
}

/** 고객의 티켓 목록 */
export function listTickets(customerId: string): Ticket[] {
  const rows = getDb().prepare(`${SELECT_TICKET} WHERE customer_id = ? ORDER BY no`).all(customerId);
  return rows.map((row) => ({ ...row }) as unknown as Ticket);
}

/** 환불을 실행한다 (가상). 되돌릴 수 없는 작업이라 실습에서는 사람 승인 뒤에만 호출한다. */
export function executeRefund(orderId: string, amount: number, reason: string): string {
  console.log(`  💸 환불 실행: ${orderId} ${amount}원 (${reason})`);
  return `${orderId} 주문 ${amount.toLocaleString("ko-KR")}원 환불을 접수했습니다.`;
}
