// 스마트몰 가상 데이터 — 주문 10건 · 택배 위치 (배포용 앱에 필요한 것만 복사, 실제 데이터 아님)

export interface Order {
  id: string;
  customerId: string;
  item: string;
  amount: number;
  status: string; // 결제 완료 · 출고 준비 · 배송 중 · 배송 완료 · 환불 완료
  eta: string; // 고객에게 안내할 도착 · 진행 정보
  trackingNo?: string; // 출고 전에는 없다
}

export const ORDERS: Order[] = [
  { id: "A100", customerId: "C001", item: "무선 이어폰", amount: 89000, status: "배송 중", eta: "출고 후 6영업일째 — 배송 지연", trackingNo: "TRK-1001" },
  { id: "A101", customerId: "C001", item: "스마트워치", amount: 259000, status: "배송 완료", eta: "3일 전 도착", trackingNo: "TRK-1002" },
  { id: "A102", customerId: "C001", item: "휴대폰 케이스", amount: 19000, status: "결제 완료", eta: "내일 출고 예정" },
  { id: "A103", customerId: "C002", item: "노트북", amount: 1290000, status: "배송 중", eta: "내일 도착 예정", trackingNo: "TRK-1004" },
  { id: "A104", customerId: "C002", item: "무선 마우스", amount: 39000, status: "배송 완료", eta: "5일 전 도착", trackingNo: "TRK-1005" },
  { id: "A105", customerId: "C002", item: "기계식 키보드", amount: 79000, status: "출고 준비", eta: "오늘 출고 예정" },
  { id: "A106", customerId: "C003", item: "태블릿", amount: 549000, status: "배송 완료", eta: "2주 전 도착", trackingNo: "TRK-1007" },
  { id: "A107", customerId: "C003", item: "고속 충전기", amount: 25000, status: "배송 중", eta: "오늘 도착 예정", trackingNo: "TRK-1008" },
  { id: "A108", customerId: "C003", item: "보조배터리", amount: 35000, status: "환불 완료", eta: "환불 처리 완료", trackingNo: "TRK-1009" },
  { id: "A109", customerId: "C001", item: "블루투스 스피커", amount: 129000, status: "배송 완료", eta: "1주 전 도착", trackingNo: "TRK-1010" },
];

/** 주문번호로 주문을 찾는다. 대소문자 · 공백 차이는 무시한다. */
export function findOrder(orderId: string): Order | undefined {
  const id = orderId.trim().toUpperCase();
  return ORDERS.find((o) => o.id === id);
}

// 송장번호 → 현재 위치 (가상 택배사 데이터)
const LOCATIONS: { [trackingNo: string]: string } = {
  "TRK-1001": "대전 허브 터미널 (물량 증가로 지연)",
  "TRK-1002": "배송 완료 — 문 앞",
  "TRK-1004": "서울 강남 배송센터 (배송 출발 전)",
  "TRK-1005": "배송 완료 — 경비실",
  "TRK-1007": "배송 완료 — 문 앞",
  "TRK-1008": "부산 해운대 배송 기사 이동 중",
  "TRK-1009": "반품 회수 완료",
  "TRK-1010": "배송 완료 — 택배함",
};

/** 가상 택배사 조회: 송장번호로 현재 위치를 돌려준다. */
export function trackParcel(trackingNo: string): string {
  const location = LOCATIONS[trackingNo];
  if (!location) throw new Error(`택배사에서 송장번호 ${trackingNo}을(를) 찾지 못했습니다.`);
  return `${trackingNo}: ${location}`;
}
