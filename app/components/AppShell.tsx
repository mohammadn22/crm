
"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      dir="rtl"
      className="flex min-h-screen bg-[#F6F7FC] text-slate-800"
    >
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((previous) => !previous)}
      />

      <main className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
