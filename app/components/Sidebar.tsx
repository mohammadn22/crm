
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

const navigation = [
  { label: "داشبورد", href: "/dashboard", icon: "dashboard" },
  { label: "مشتریان", href: "/customers", icon: "customers" },
  { label: "بیمه‌نامه‌ها", href: "/policies", icon: "policies" },
  { label: "حسابداری", href: "/accounting", icon: "accounting" },
  { label: "پیگیری", href: "/followup", icon: "followup" },
  { label: "پرداخت آنلاین", href: "/onlinepayment", icon: "cloud" },
  { label: "ارسال پیامک", href: "/sms", icon: "sms" },
];

function Icon({
  name,
  size = 21,
}: {
  name: string;
  size?: number;
}) {
  if (name === "chevron") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    );
  }

  return (
    <Image
      src={`/icons/${name}.svg`}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      unoptimized
    />
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      dir="rtl"
      className={`hidden min-h-screen shrink-0 flex-col border-l border-slate-100 bg-white transition-[width] duration-300 md:flex ${
        collapsed ? "w-[88px]" : "w-[260px]"
      }`}
    >
      <div
        className={`flex h-[88px] shrink-0 items-center border-b border-slate-100 ${
          collapsed ? "justify-center px-3" : "gap-3 px-6"
        }`}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-xl font-black text-white shadow-lg shadow-indigo-200">
          ب
        </div>

        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900">
              بیمه ۴۶
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              مدیریت هوشمند دفتر بیمه
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-7">
        {!collapsed && (
          <p className="mb-4 px-3 text-[11px] font-bold tracking-wider text-slate-400">
            منوی اصلی
          </p>
        )}

        <div className="space-y-2">
          {navigation.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[48px] items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition-all ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200/60"
                    : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                }`}
              >
                <Icon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}

                {active && !collapsed && (
                  <span className="mr-auto h-1.5 w-1.5 rounded-full bg-amber-300" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="space-y-1 border-t border-slate-100 p-3">

        <button
          type="button"
          onClick={onToggle}
          className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label={collapsed ? "باز کردن منو" : "جمع کردن منو"}
          title={collapsed ? "باز کردن منو" : "جمع کردن منو"}
        >
          <span
            className={`transition-transform duration-300 ${
              collapsed ? "rotate-180" : ""
            }`}
          >
            <Icon name="chevron" size={19} />
          </span>
          {!collapsed && <span>جمع کردن منو</span>}
        </button>
      </div>
    </aside>
  );
}
