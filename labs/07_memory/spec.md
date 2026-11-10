# 07 메모리 챗봇 — 웹 채팅 버전 스펙

`solution.ts`의 터미널 챗봇을 브라우저 채팅 화면으로 쓸 수 있게 만든다.
구조는 `labs/13_deploy/solution.ts`와 `labs/13_deploy/public/index.html`을 그대로 본뜬다.

Claude Code에서 쓰는 법: `@labs/07_memory/spec.md 대로 만들어 줘`

## 구조

```
브라우저 → fetch("/api/chat") → Express → agent.invoke() → { answer } → 화면 표시
```

## 만들 파일

`labs/07_memory/web/` 하위 폴더에 만든다.

| 파일 | 내용 |
|---|---|
| `labs/07_memory/web/server.ts` | Express 서버 |
| `labs/07_memory/web/public/index.html` | 채팅 화면 (HTML 하나, 외부 라이브러리 없이) |

## 서버 요구 사항

- 그래프 구성(State · Context · 노드 · 시스템 프롬프트)은 `solution.ts`에서 `server.ts`로 복사한다.
  `solution.ts`를 import하지 않는다 (터미널 입력 코드까지 함께 실행되기 때문).
- 터미널 입력(readline) · 반복문 · time-travel 부분은 가져오지 않는다.
- compile 할 때 `MemorySaver` 체크포인터와 `InMemoryStore` 스토어를 넣는다.
- 서버가 시작될 때 스토어에 `store.put(["preferences", "C002"], "contact", { method: "이메일" })`을 저장해 둔다.
- `POST /api/chat`은 `{ threadId, message }`를 받아
  `configurable.thread_id = threadId`, `context = { customerId: "C002" }`로 invoke 하고
  마지막 메시지 text를 `{ answer }`로 돌려준다.
- threadId가 문자열이 아니거나, message가 비었거나 500자를 넘으면 400과 `{ error }`.
- `express.static`으로 `web/public` 폴더를 보여 준다 (경로는 `import.meta.dirname` 기준).
- 포트는 `PORT` 환경 변수, 없으면 3000. 시작하면 접속 주소를 콘솔에 출력한다.

## 화면 요구 사항

- 페이지를 열 때 `crypto.randomUUID()`로 threadId를 만든다.
- 입력창 + 보내기 버튼, Enter로도 보낸다.
- 내 말은 오른쪽, 챗봇 답은 왼쪽 말풍선.
- 답을 기다리는 동안 "…" 표시, 보내기 버튼은 잠시 비활성화.
- 오류가 나면 화면에 빨간 글씨로 표시.
- 「새 대화」 버튼은 threadId만 새로 만들고 화면을 비운다.
- 화면 위쪽에 현재 threadId 앞 8자리를 작게 표시한다 (대화방이 바뀌는 것을 눈으로 확인).

## 지킬 것

- `solution.ts` · `exercise.ts`는 수정하지 않는다.
- API 키는 서버에서만 쓰고 브라우저로 보내지 않는다.
- 모델은 `solution.ts`처럼 `process.env.MODEL ?? "openai:gpt-6-luna"`.
- 주석은 한국어로, 13_deploy 수준으로 짧게.
- 새 패키지는 설치하지 않는다 (express는 이미 있음).
- `package.json` scripts에 `"web:07": "tsx labs/07_memory/web/server.ts"`를 추가한다.

## 완료 확인

1. `npm run typecheck` 통과
2. `npm run web:07`로 서버를 띄우고 curl로 확인한다.

| # | 요청 | 기대 결과 | 확인하는 개념 |
|---|---|---|---|
| 1 | 같은 threadId로 "제 이름은 김민준이에요" → "제 이름이 뭐였죠?" | 두 번째 답에 김민준 | 체크포인터 |
| 2 | 다른 threadId로 "제 이름이 뭐였죠?" | 모른다고 답함 | thread 분리 |
| 3 | 새 threadId로 "원하는 연락 방법이 뭐였죠?" | 이메일 | 스토어 (장기 메모리) |
| 4 | message 없이 보냄 | 400 | 입력 검사 |

3. 확인 결과를 보여 주고 서버를 끈다.
