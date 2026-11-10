// 00 API 키 점검 스크립트 테스트 — 실제 모델 대신 가짜 호출 함수를 넣어 결과 분류만 확인한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAll, type Target } from "../labs/00_first_agent/test_all_models.ts";

const targets: Target[] = [
  { envKey: "A_KEY", model: "a:cheap" },
  { envKey: "B_KEY", model: "b:cheap" },
];

test("키가 있고 응답하면 ok, 응답 앞부분을 담는다", async () => {
  const results = await checkAll(targets, { A_KEY: "x", B_KEY: "y" }, async () => " ping \n");
  assert.deepEqual(results.map((r) => [r.status, r.detail]), [["ok", "ping"], ["ok", "ping"]]);
});

test("키가 없거나 공백뿐이면 호출하지 않고 skip", async () => {
  const called: string[] = [];
  const results = await checkAll(targets, { A_KEY: "   " }, async (model) => (called.push(model), "ping"));
  assert.deepEqual(results.map((r) => r.status), ["skip", "skip"]);
  assert.equal(results[0].detail, "A_KEY 없음");
  assert.deepEqual(called, []);
});

test("한 곳이 실패해도 나머지는 계속 확인하고, 오류 첫 줄만 남긴다", async () => {
  const results = await checkAll(targets, { A_KEY: "x", B_KEY: "y" }, async (model) => {
    if (model === "a:cheap") throw new Error("401 Unauthorized\nstack...");
    return "ping";
  });
  assert.deepEqual(results.map((r) => r.status), ["fail", "ok"]);
  assert.equal(results[0].detail, "401 Unauthorized");
});

test("Error가 아닌 값이 던져져도 fail로 분류한다", async () => {
  const results = await checkAll([targets[0]], { A_KEY: "x" }, async () => {
    throw "boom";
  });
  assert.deepEqual([results[0].status, results[0].detail], ["fail", "boom"]);
});
