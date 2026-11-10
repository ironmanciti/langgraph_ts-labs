// (강사용) solution.ts에서 정답 구간을 지워 exercise.ts(실습 문제)를 만든다.
//
//   //#region 정답      ← 이 줄부터
//   ...정답 코드...
//   //#endregion       ← 이 줄까지 지우고 "✏️ 여기에 코드를 작성하세요"를 남긴다
//
//   /// 로 시작하는 주석은 solution.ts에만 두는 줄별 설명이다 → exercise.ts에서는 지운다
//
// 사용법: npm run make-exercises            (labs/*/solution.ts 전체를 다시 생성)
//         npm run make-exercises -- 08b 08d (이름이 08b · 08d로 시작하는 실습만 다시 생성)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const labsDir = new URL("../labs/", import.meta.url);
const only = process.argv.slice(2); // 명령 뒤에 적은 실습 번호 (없으면 전체)
let count = 0;

for (const dir of readdirSync(labsDir)) {
  if (only.length > 0 && !only.some((prefix) => dir.startsWith(prefix))) continue;
  const solution = new URL(`${dir}/solution.ts`, labsDir);
  if (!existsSync(solution)) continue;
  const source = readFileSync(solution, "utf8");
  if (!source.includes("//#region 정답")) continue; // 빈칸이 없는 예제(00)는 건너뛴다

  const lines = [];
  let inAnswer = false;
  for (const line of readFileSync(solution, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("//#region 정답")) {
      inAnswer = true;
      const indent = line.slice(0, line.indexOf("//"));
      lines.push(`${indent}// ✏️ 여기에 코드를 작성하세요`);
    } else if (line.trim().startsWith("//#endregion")) {
      inAnswer = false;
    } else if (inAnswer || line.trim().startsWith("///")) {
      continue; // 정답 코드 · 설명 주석 줄은 건너뛴다
    } else {
      lines.push(line.replace(/\s+\/\/\/ .*$/, "")); // 줄 끝의 /// 설명도 지운다
    }
  }

  const exercise = lines
    .join("\n")
    .replace("// 정답 코드", "// 실습 문제 (✏️ 자리를 채우세요, 정답은 solution.ts)")
    .replace("/solution.ts", "/exercise.ts");
  writeFileSync(new URL(`${dir}/exercise.ts`, labsDir), exercise);
  count += 1;
}

console.log(`exercise.ts ${count}개를 생성했습니다.`);
