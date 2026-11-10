// 예제 — .env의 API 키가 회사별로 동작하는지 한 번에 확인한다 (값싼 모델에 짧은 질문 한 번씩)
// 실행: npm run check-keys   (= npx tsx labs/00_first_agent/test_all_models.ts)
//   ✅ 응답 성공 · ❌ 키가 틀렸거나 모델 이름 · 권한 문제 · ⏭️ .env에 키가 없어 건너뜀
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { initChatModel } from "langchain";

// 확인할 회사 — 키 이름과 테스트용 값싼 모델 (모델 이름이 바뀌면 여기만 고친다)
export const TARGETS = [
  { envKey: "OPENAI_API_KEY", model: "openai:gpt-5.4-mini" },
  { envKey: "ANTHROPIC_API_KEY", model: "anthropic:claude-haiku-4-5" },
  { envKey: "GOOGLE_API_KEY", model: "google:gemini-3.6-flash" },
];

export type Target = (typeof TARGETS)[number];
export type Result = {
  model: string;
  status: "ok" | "fail" | "skip";
  detail: string;
  seconds: number;
};
type Ask = (model: string) => Promise<string>;

// 실제 모델 호출 — 토큰을 아끼려고 아주 짧게 답하게 한다
const askModel: Ask = async (model) => {
  const llm = await initChatModel(model, { maxTokens: 20 });
  const reply = await llm.invoke("ping이라고만 답해.");
  return reply.text;
};

/** 회사별로 동시에 확인하고, 한 곳이 실패해도 나머지 결과를 모두 돌려준다 */
export async function checkAll(
  targets: Target[],
  env: Record<string, string | undefined> = process.env,
  ask: Ask = askModel,
): Promise<Result[]> {
  return Promise.all(
    targets.map(async ({ envKey, model }): Promise<Result> => {
      if (!env[envKey]?.trim())
        return { model, status: "skip", detail: `${envKey} 없음`, seconds: 0 };
      const started = Date.now();
      try {
        const text = await ask(model);
        return {
          model,
          status: "ok",
          detail: text.trim().slice(0, 40),
          seconds: (Date.now() - started) / 1000,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          model,
          status: "fail",
          detail: message.split("\n")[0].slice(0, 120),
          seconds: (Date.now() - started) / 1000,
        };
      }
    }),
  );
}

// 직접 실행할 때만 동작한다 (테스트에서 불러올 때는 실행하지 않는다)
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const ICONS = { ok: "✅", fail: "❌", skip: "⏭️" };
  const results = await checkAll(TARGETS);
  for (const r of results) {
    const time = r.status === "skip" ? "" : ` (${r.seconds.toFixed(1)}초)`;
    console.log(`${ICONS[r.status]} ${r.model}${time} — ${r.detail}`);
  }
  // 하나라도 실패하면 종료 코드 1
  if (results.some((r) => r.status === "fail")) process.exitCode = 1;
}
