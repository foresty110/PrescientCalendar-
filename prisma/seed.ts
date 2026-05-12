/**
 * 시드 데이터 — 데모 사용자 1명 + 회고 패턴 fixture.
 * 추후 Step 3 이후 채움. 지금은 placeholder.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // TODO: Step 6 회고 캡처 이후 4주치 ActualRun fixture 채우기.
  // 데모 사용자는 첫 Google 로그인 시 자동 생성되므로 prod에선 seed 안 돌림.
  console.log("seed: placeholder — 실제 데이터는 Step 6 이후 추가");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
