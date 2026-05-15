"use client";

import { useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { Calendar } from "@/components/Calendar";
import { Chat, type ChatContext, type ChatHandle } from "@/components/Chat";
import { TodayTimeline } from "@/components/timeline/TodayTimeline";
import type { ScheduleCardItem } from "@/components/timeline/ScheduleCard";
import type { TimelineStatus } from "@/components/timeline/status";

const KST = "Asia/Seoul";

function buildPrefill(status: TimelineStatus, time: string, title: string): string {
  switch (status) {
    case "needs_retro":
      return `오늘 ${time} ${title} 어땠어? 회고할게`;
    case "completed":
    case "missed":
      return `오늘 ${time} ${title} 회고 기록 정리해줘`;
    case "in_progress":
    case "upcoming":
      return `오늘 ${time} ${title} 일정에 대해 이야기하고 싶어`;
  }
}

export function AppShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const chatRef = useRef<ChatHandle>(null);

  function handleTimelineCardSelect(item: ScheduleCardItem) {
    const time = formatInTimeZone(new Date(item.scheduledStartAt), KST, "HH:mm");
    chatRef.current?.prefill(
      buildPrefill(item.status, time, item.title),
      "일정 카드에서 시작됨",
    );
    setChatContext({
      scheduledRunId: item.scheduledRunId,
      title: item.title,
      time,
    });
  }

  function handleTimelineAddClick() {
    chatRef.current?.focusInput();
  }

  return (
    <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex flex-col gap-4">
        <Calendar refreshKey={refreshKey} />
        <TodayTimeline
          refreshKey={refreshKey}
          onSelect={handleTimelineCardSelect}
          onAddClick={handleTimelineAddClick}
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
