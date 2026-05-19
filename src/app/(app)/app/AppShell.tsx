"use client";

import { useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { Calendar } from "@/components/Calendar";
import { Chat, type ChatContext, type ChatHandle } from "@/components/Chat";
import { SeedTestDataBanner } from "@/components/SeedTestDataBanner";
import { TodayTimeline } from "@/components/timeline/TodayTimeline";
import type { ScheduleCardItem } from "@/components/timeline/ScheduleCard";
import type { TimelineStatus } from "@/components/timeline/status";
import { pickDateLabel, todayKstDateKey } from "@/lib/date-labels";

const KST = "Asia/Seoul";

function buildPrefill(
  status: TimelineStatus,
  when: string,
  title: string,
  dateLabel: string,
): string {
  // when 은 "HH:mm" 또는 종일 카드일 경우 "종일". dateLabel 은 "오늘"/"어제"/"내일"/"M월 d일 (요일)".
  // 둘 다 자연어로 그대로 흘려보낸다.
  switch (status) {
    case "needs_retro":
      return `${dateLabel} ${when} ${title} 어땠어? 회고할게`;
    case "completed":
    case "missed":
      return `${dateLabel} ${when} ${title} 회고 기록 정리해줘`;
    case "in_progress":
    case "upcoming":
      return `${dateLabel} ${when} ${title} 일정에 대해 이야기하고 싶어`;
  }
}

export function AppShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  // 캘린더에서 클릭한 날짜 — KST 'yyyy-MM-dd'. 초기는 오늘. 첫 마운트 시 한 번만 계산해
  // 자정 넘기 전까지 동일 값을 유지. (자정 넘으면 새로고침 시 새 오늘로 재계산)
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayKstDateKey(new Date()));
  const chatRef = useRef<ChatHandle>(null);

  function handleTimelineCardSelect(item: ScheduleCardItem) {
    const time = formatInTimeZone(new Date(item.scheduledStartAt), KST, "HH:mm");
    const when = item.isAllDay ? "종일" : time;
    const dateLabel = pickDateLabel(selectedDateKey, todayKstDateKey(new Date()));
    chatRef.current?.prefill(
      buildPrefill(item.status, when, item.title, dateLabel),
      "일정 카드에서 시작됨",
    );
    setChatContext({
      scheduledRunId: item.scheduledRunId,
      title: item.title,
      time: when,
      status: item.status,
    });
  }

  function handleTimelineAddClick() {
    chatRef.current?.focusInput();
  }

  function handleEmptyStateExample(text: string) {
    // 사용자가 보내기 전 수정 가능하도록 prefill 만 — send 자동 호출 안 함.
    chatRef.current?.prefill(text, "예시에서 시작");
  }

  function handleCalendarJumpToToday() {
    // Calendar 의 '오늘' 버튼은 보고 있는 달 뿐 아니라 타임라인 선택 날짜까지 오늘로 리셋.
    setSelectedDateKey(todayKstDateKey(new Date()));
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <SeedTestDataBanner onSeeded={() => setRefreshKey((k) => k + 1)} />
      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_520px]">
        <div className="flex flex-col gap-4">
          <Calendar
            refreshKey={refreshKey}
            selectedDateKey={selectedDateKey}
            onDateSelect={setSelectedDateKey}
            onJumpToToday={handleCalendarJumpToToday}
            onDataChange={() => setRefreshKey((k) => k + 1)}
          />
          <TodayTimeline
            refreshKey={refreshKey}
            onSelect={handleTimelineCardSelect}
            onAddClick={handleTimelineAddClick}
            onExampleClick={handleEmptyStateExample}
            selectedScheduledRunId={chatContext?.scheduledRunId ?? null}
            selectedDateKey={selectedDateKey}
          />
        </div>
        <Chat
          ref={chatRef}
          onCompletion={() => setRefreshKey((k) => k + 1)}
          context={chatContext}
          onContextClear={() => setChatContext(null)}
        />
      </div>
    </section>
  );
}
