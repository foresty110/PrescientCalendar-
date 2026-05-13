/**
 * Zod 스키마 → openapi.json. `pnpm openapi:gen` 으로 실행.
 *
 * Scalar 페이지(/api/docs)가 빌드된 public/openapi.json을 fetch해서 렌더링한다.
 * 라우트나 스키마를 바꾼 뒤 이 스크립트를 다시 돌리고 결과를 커밋한다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildOpenApiDoc } from "../src/lib/openapi";

const doc = buildOpenApiDoc();
const out = join(process.cwd(), "public", "openapi.json");
/* eslint-disable security/detect-non-literal-fs-filename --
   out 경로는 process.cwd() 기반 빌드 출력 — 외부 입력 아님 */
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2));
/* eslint-enable security/detect-non-literal-fs-filename */
console.log(`openapi.json 생성: ${out}`);
