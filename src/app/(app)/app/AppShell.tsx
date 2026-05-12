"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { Calendar } from "@/components/Calendar";

export function AppShell() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section className="grid flex-1 gap-4 lg:grid-cols-[400px_1fr]">
      <Chat onCompletion={() => setRefreshKey((k) => k + 1)} />
      <Calendar refreshKey={refreshKey} />
    </section>
  );
}
