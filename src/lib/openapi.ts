/**
 * OpenAPI 3.1 문서 빌더 — Zod 스키마에 OpenAPI 메타데이터를 곁들여 정의하고,
 * `@asteasolutions/zod-to-openapi`로 단일 출처에서 문서를 생성한다.
 *
 * Scalar 페이지(`/api/docs`)가 빌드된 `public/openapi.json`을 참조하므로,
 * 라우트나 스키마가 바뀌면 `pnpm openapi:gen`을 다시 돌려야 한다.
 */
import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// 공통 스키마
// ---------------------------------------------------------------------------

const ErrorEnvelope = z
  .object({
    error: z.object({
      code: z.enum([
        "VALIDATION_ERROR",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "RATE_LIMITED",
        "INTERNAL",
      ]),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi("ErrorEnvelope");

registry.register("ErrorEnvelope", ErrorEnvelope);

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

const ChatMessage = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })
  .openapi({
    description: "한 턴의 대화 메시지. role과 content로 구성.",
    example: { role: "user", content: "내일 오후 3시 운동 1시간" },
  });

// 의도적으로 .openapi({ example }) 미부착 — Scalar try-it-out에 자동 채워진
// 샘플 본문이 보이지 않게 해 클릭 유인을 줄임 (LLM 비용 차단 보조 장치).
const ChatRequest = z
  .object({
    messages: z.array(ChatMessage).min(1).max(50),
  })
  .openapi({
    description:
      "지금까지의 대화 메시지 전체. 서버가 일정 잡기·회고·실현 가능성 모드를 자동 라우팅한다.",
  });

const ChatResponse = z
  .object({
    text: z.string().openapi({ description: "어시스턴트 최종 응답 텍스트" }),
    toolCalls: z.array(
      z.object({
        name: z.string(),
        input: z.unknown(),
        output: z.unknown().optional(),
        error: z.string().optional(),
      }),
    ),
    stopReason: z.string(),
  })
  .openapi({
    description: "어시스턴트 응답 + 호출된 도구 시퀀스 + 종료 사유",
  });

registry.registerPath({
  method: "post",
  path: "/api/chat",
  tags: ["대화"],
  summary: "자연어로 일정 만들기·회고·실현 가능성 질의",
  description:
    "> ⚠️ **이 엔드포인트는 호출당 Anthropic Claude API 비용(약 ₩1~10)이 발생합니다.**\n" +
    "> 이 페이지의 try-it-out 대신 실제 채팅 UI(`/app`)에서 검증하세요. 이 섹션은 입출력 형식·예제 확인용입니다.\n\n" +
    "사용자 채팅 메시지를 받아 LLM 에이전트가 도구(일정 CRUD·회고 기록·통계·실현 가능성)를 호출하고 결과를 텍스트로 응답한다. 인증 필수 (세션 쿠키).",
  // 의도적으로 빈 servers — try-it-out이 호출할 서버 없음 → Send 버튼 무력화.
  // 비용 발생 가능한 엔드포인트는 문서만 보이고 인터랙티브 호출은 차단.
  servers: [],
  request: {
    body: {
      content: { "application/json": { schema: ChatRequest } },
    },
  },
  responses: {
    200: {
      description: "정상 응답",
      content: { "application/json": { schema: ChatResponse } },
    },
    400: {
      description: "요청 검증 실패",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
    401: {
      description: "로그인 필요",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
    500: {
      description: "내부 오류",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
  },
});

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------

const EventQuery = z.object({
  from: z.string().datetime().openapi({ example: "2026-05-01T00:00:00+09:00" }),
  to: z.string().datetime().openapi({ example: "2026-05-31T23:59:59+09:00" }),
  withActualRun: z.enum(["true", "false"]).optional(),
});

const ScheduledRunItem = z
  .object({
    scheduledRunId: z.string(),
    eventId: z.string(),
    title: z.string(),
    scheduledStartAt: z.string().datetime(),
    scheduledDurationMin: z.number().int(),
    feasibilityScore: z.number().int().nullable(),
    actualRun: z
      .object({
        actualStartAt: z.string().datetime(),
        actualDurationMin: z.number().int(),
        status: z.enum(["done", "skipped", "late"]),
      })
      .optional(),
  })
  .openapi({ description: "한 ScheduledRun과 (요청 시) 회고 정보" });

const EventsResponse = z
  .object({ items: z.array(ScheduledRunItem) })
  .openapi({ description: "from~to 범위 ScheduledRun 목록" });

registry.registerPath({
  method: "get",
  path: "/api/events",
  tags: ["일정"],
  summary: "기간 내 일정·회고 목록 조회",
  description:
    "캘린더 표시·LLM 컨텍스트용. `from`·`to`는 ISO-8601, KST offset 권장. `withActualRun=true`면 회고도 포함.",
  request: {
    query: EventQuery,
  },
  responses: {
    200: {
      description: "정상 응답",
      content: { "application/json": { schema: EventsResponse } },
    },
    400: {
      description: "쿼리 검증 실패",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
    401: {
      description: "로그인 필요",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
  },
});

// ---------------------------------------------------------------------------
// POST /api/retros
// ---------------------------------------------------------------------------

const RetroRequest = z
  .object({
    scheduledRunId: z.string().min(1),
    actualStartAt: z.string().datetime().openapi({ example: "2026-05-12T07:15:00+09:00" }),
    actualDurationMin: z.number().int().min(0).max(720),
    status: z.enum(["done", "skipped", "late"]),
  })
  .openapi({
    description: "특정 ScheduledRun에 대한 회고 기록. 같은 ScheduledRun에 다시 보내면 갱신.",
    example: {
      scheduledRunId: "cmp...",
      actualStartAt: "2026-05-12T07:15:00+09:00",
      actualDurationMin: 25,
      status: "late",
    },
  });

const RetroResponse = z
  .object({
    actualRunId: z.string(),
    scheduledRunId: z.string(),
    actualStartAt: z.string().datetime(),
    actualDurationMin: z.number().int(),
    status: z.enum(["done", "skipped", "late"]),
  })
  .openapi({ description: "저장(또는 갱신)된 회고" });

registry.registerPath({
  method: "post",
  path: "/api/retros",
  tags: ["회고"],
  summary: "캘린더 모달에서 회고 직접 입력",
  description:
    "채팅 도구(`record_actual_run`)와 동일한 핸들러를 호출. UI에서 LLM 비용 없이 직접 저장하는 경로.",
  request: {
    body: { content: { "application/json": { schema: RetroRequest } } },
  },
  responses: {
    200: {
      description: "정상 응답 (UPSERT 결과)",
      content: { "application/json": { schema: RetroResponse } },
    },
    400: {
      description: "본문 검증 실패",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
    401: {
      description: "로그인 필요",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
    403: {
      description: "다른 사용자 일정에 회고 시도 (IDOR 차단)",
      content: { "application/json": { schema: ErrorEnvelope } },
    },
  },
});

// ---------------------------------------------------------------------------
// 문서 생성기
// ---------------------------------------------------------------------------

export function buildOpenApiDoc() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Prescient Calendar API",
      version: "0.1.0",
      description:
        "자연어로 일정을 만들고 회고하고 실현 가능성을 평가하는 캘린더 서비스의 HTTP API. " +
        "인증은 세션 쿠키 기반(Auth.js)이며, 모든 도메인 라우트는 로그인 사용자만 접근 가능.",
    },
    servers: [
      { url: "http://localhost:3000", description: "로컬 개발" },
      { url: "https://prescient-calendar.vercel.app", description: "프로덕션 (배포 후)" },
    ],
    tags: [
      { name: "대화", description: "LLM 에이전트 채팅 — 일정·회고·실현 가능성 통합" },
      { name: "일정", description: "ScheduledRun 조회" },
      { name: "회고", description: "ActualRun 기록 (UI 직접 호출 경로)" },
    ],
  });
}
