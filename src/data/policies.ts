// 스마트몰 정책 문서(policies/*.md)를 LangChain Document로 읽는다
import { readdirSync, readFileSync } from "node:fs";
import { Document } from "@langchain/core/documents";

const POLICY_DIR = new URL("./policies/", import.meta.url);

/** 정책 문서마다 Document 하나. metadata.source에 파일 이름을 남긴다 */
export function loadPolicyDocs(): Document[] {
  const docs: Document[] = [];
  for (const file of readdirSync(POLICY_DIR)) {
    const text = readFileSync(new URL(file, POLICY_DIR), "utf8");
    docs.push(new Document({ pageContent: text, metadata: { source: file } }));
  }
  return docs;
}
