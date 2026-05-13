/**
 * 인증 주입 헬퍼 — Google OAuth를 실제로 거치지 않고 테스트 사용자·세션을
 * DB에 직접 만들고 그 세션 토큰을 Playwright 브라우저 컨텍스트에 쿠키로 심는다.
 *
 * Auth.js v5 + Prisma 어댑터의 DB session 전략 덕에 가능 — `Session.sessionToken`
 * 값을 `authjs.session-token` 쿠키로 보내면 서버의 `auth()`가 그대로 인식.
 *
 * 동일 이메일로 반복 실행 가능하도록 user는 upsert, session은 매번 새로 생성.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const E2E_USER_EMAIL = "e2e-test@example.com";
const E2E_USER_NAME = "E2E Test User";
const SESSION_COOKIE_NAME = "authjs.session-token";

let _prisma: PrismaClient | null = null;

function db(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export interface InjectedSession {
  userId: string;
  email: string;
  sessionToken: string;
  cookieName: string;
}

/** 테스트용 사용자(없으면 생성)와 새 세션을 DB에 만들고 쿠키 정보를 반환. */
export async function createE2ESession(): Promise<InjectedSession> {
  const user = await db().user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: {},
    create: { email: E2E_USER_EMAIL, name: E2E_USER_NAME },
  });

  const sessionToken = randomUUID();
  await db().session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });

  return {
    userId: user.id,
    email: user.email,
    sessionToken,
    cookieName: SESSION_COOKIE_NAME,
  };
}

/** 테스트가 만든 모든 e2e 사용자·세션·도메인 데이터 정리. */
export async function cleanupE2EData(): Promise<void> {
  await db().user.deleteMany({ where: { email: E2E_USER_EMAIL } });
}

export async function disconnectDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
