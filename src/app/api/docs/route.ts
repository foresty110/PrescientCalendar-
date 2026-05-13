/**
 * 공개 API 명세 페이지. 로그인 안 한 방문자(채용 담당·동료)도 무엇이 만들어졌는지
 * 한눈에 볼 수 있도록 미들웨어 공개 경로에 포함되어 있다.
 *
 * Scalar(@scalar/api-reference)는 CDN 스크립트로 로드 — 빌드 의존성 추가 없이
 * 가벼움. 명세 JSON은 public/openapi.json 으로 별도 노출 (브라우저가 fetch).
 */
export const runtime = "nodejs";

const HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>Prescient Calendar API</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="자연어 일정·회고·실현 가능성 API 명세. Scalar로 렌더링."
    />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.json"
      data-configuration='{"hideClientButton":false,"defaultHttpClient":{"targetKey":"shell","clientKey":"curl"}}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
