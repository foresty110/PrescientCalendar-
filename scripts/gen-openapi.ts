/**
 * Zod 스키마 → openapi.json 생성. `pnpm openapi:gen` 으로 실행.
 * /api/docs 라우트가 이 파일을 읽어 Scalar 페이지를 렌더.
 */

// TODO: Step 5 라우트 추가 이후 OpenAPI 레지스트리 채우기.
// import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

import { writeFileSync } from "node:fs";

const placeholder = {
  openapi: "3.1.0",
  info: {
    title: "Prescient Calendar API",
    version: "0.1.0",
    description: "구현 진행 중 — 라우트 추가 시 자동 갱신",
  },
  paths: {},
};

writeFileSync("openapi.json", JSON.stringify(placeholder, null, 2));
console.log("openapi.json 생성 완료 (placeholder)");
