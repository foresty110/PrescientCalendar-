"use client";

import { useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { Calendar } from "@/components/Calendar";
import { Chat, type ChatContext, type ChatHandle } from "@/components/Chat";
import { TodayTimeline } from "@/components/timeline/TodayTimeline";
import type { ScheduleCardItem } from "@/components/timeline/ScheduleCard";
import type { TimelineStatus } from "@/components/timeline/status";

const KST = "Asia/Seoul";

function buildPrefill(
  status: TimelineStatus,
  when: string,
  title: string,
): string {
  // when 은 "HH:mm" 또는 종일 카드일 경우 "종일" — 어느 쪽이든 자연어로 그대로 흘려보낸다.
  switch (status) {
    case "needs_retro":
      return `오늘 ${when} ${title} 어땠어? 회고할게`;
    case "completed":
    case "missed":
      return `오늘 ${when} ${title} 회고 기록 정리해줘`;
    case "in_progress":
    case "upcoming":
      return `오늘 ${when} ${title} 일정에 대해 이야기하고 싶어`;
  }
}

export function AppShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const chatRef = useRef<ChatHandle>(null);

  function handleTimelineCardSelect(item: ScheduleCardItem) {
    const time = formatInTimeZone(new Date(item.scheduledStartAt), KST, "HH:mm");
    const when = item.isAllDay ? "종일" : time;
    chatRef.current?.prefill(
      buildPrefill(item.status, when, item.title),
      "일정 카드에서 시작됨",
    );
    setChatContext({
      scheduledRunId: item.scheduledRunId,
      title: item.title,
      time: when,
    });
  }

  function handleTimelineAddClick() {
    chatRef.current?.focusInput();
  }

  function handleEmptyStateExample(text: string) {
    // 사용자가 보내기 전 수정 가능하도록 prefill 만 — send 자동 호출 안 함.
    chatRef.current?.prefill(text, "예시에서 시작");
  }

  return (
    <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex flex-col gap-4">
        <Calendar refreshKey={refreshKey} />
        <TodayTimeline
          refreshKey={refreshKey}
          onSelect={handleTimelineCardSelect}
          onAddClick={handleTimelineAddClick}
          onExampleClick={handleEmptyStateExample}
          selectedScheduledRunId={chatContext?.scheduledRunId ?? null}
        />
      </div>
      <Chat
        ref={chatRef}
        onCompletion={() => setRefreshKey((k) => k + 1)}
        context={chatContext}
        onContextClear={() => setChatContext(null)}
      />
    </section>
  );
}
