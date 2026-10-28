
"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toGregorian, toJalaali } from "jalaali-js";
import AppShell from "../components/AppShell";

type IconName = "calendar" | "wallet" | "clock" | "arrow";

type Relation<T> = T | T[] | null;

type Customer = {
  full_name: string;
  mobile: string;
};

type Policy = {
  policy_number: string;
  policy_type: string;
  customers: Relation<Customer>;
};

type Allocation = {
  allocated_amount: number | string;
  transactions: Relation<{ transaction_type: string }>;
};

type PaymentSchedule = {
  id: string;
  amount_due: number | string;
  due_date: string;
  description: string;
  paid: boolean;
  policies: Relation<Policy>;
  transaction_allocations: Allocation[] | null;
};

type RenewalPolicy = {
  id: string;
  policy_number: string;
  policy_type: string;
  end_date: string;
  customers: Relation<Customer>;
};

type PaymentFollowupStatus = {
  payment_schedule_id: string;
  status: "first" | "second" | "third" | "paid";
};

type PolicyFollowupStatus = {
  policy_id: string;
  status: "first" | "second" | "third" | "done";
};

type UpcomingPayment = PaymentSchedule & {
  policy: Policy | null;
  customer: Customer | null;
  outstanding: number;
};

type UpcomingRenewal = RenewalPolicy & {
  customer: Customer | null;
};

function Icon({
  name,
  size = 21,
}: {
  name: IconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="15" rx="3" />
          <path d="M3 9h18M16 14h2" />
          <path d="M7 5V3h10v2" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      );
  }
}

function getRelation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getCustomer(policy: Policy | RenewalPolicy | null) {
  return policy ? getRelation(policy.customers) : null;
}

function signedAllocation(item: Allocation): number {
  const amount = Number(item.allocated_amount) || 0;
  const transaction = Array.isArray(item.transactions)
    ? item.transactions[0]
    : item.transactions;

  // Allocations of reversal transactions are stored as positive numbers
  // and must be subtracted (same rule as the accounting page).
  return transaction?.transaction_type === "reversal" ? -amount : amount;
}

function makeJalaliDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function getToday(): string {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return makeJalaliDate(get("year"), get("month"), get("day"));
}

function addDays(value: string, days: number): string {
  const [jy, jm, jd] = value.split("/").map(Number);
  const { gy, gm, gd } = toGregorian(jy, jm, jd);

  const date = new Date(Date.UTC(gy, gm - 1, gd + days));
  const result = toJalaali(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );

  return makeJalaliDate(result.jy, result.jm, result.jd);
}



function formatDate(value: string): string {
  const [year, month, day] = value.split("/").map(Number);
  const { gy, gm, gd } = toGregorian(year, month, day);

  const date = new Date(Date.UTC(gy, gm - 1, gd));

  const weekday = new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);

  const formattedDate = new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  const parts = new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${weekday} ${getPart("day")} ${getPart("month")} ${getPart("year")}`;
}



function formatMoney(value: number): string {
  return new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: 0,
  }).format(value);
}

const cardClass =
  "overflow-hidden rounded-[26px] border border-slate-100 bg-white shadow-sm transition hover:shadow-lg";

const itemClass =
  "border-b border-slate-100 px-5 py-4 last:border-b-0 sm:px-6";

export default function DashboardPage() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [payments, setPayments] = useState<UpcomingPayment[]>([]);
  const [renewals, setRenewals] = useState<UpcomingRenewal[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadFollowups() {
      setLoading(true);
      setLoadError("");

      try {
        const supabase = createClient();
        const today = getToday();
        const paymentEndDate = addDays(today, 3);
        const renewalEndDate = addDays(today, 10);

        const [paymentResult, renewalResult] = await Promise.all([
          supabase
            .from("payment_schedule")
            .select(`
              id,
              amount_due,
              due_date,
              description,
              paid,
              policies!inner (
                policy_number,
                policy_type,
                customers!inner (
                  full_name,
                  mobile
                )
              ),
              transaction_allocations (
                allocated_amount,
                transactions (
                  transaction_type
                )
              )
            `)
            .gte("due_date", today)
            .lte("due_date", paymentEndDate)
            .order("due_date", { ascending: true }),

          supabase
            .from("policies")
            .select(`
              id,
              policy_number,
              policy_type,
              end_date,
              customers!inner (
                full_name,
                mobile
              )
            `)
            .gte("end_date", today)
            .lte("end_date", renewalEndDate)
            .order("end_date", { ascending: true }),
        ]);

        if (paymentResult.error) throw paymentResult.error;
        if (renewalResult.error) throw renewalResult.error;

        const schedules =
          (paymentResult.data ?? []) as unknown as PaymentSchedule[];

        const policies =
          (renewalResult.data ?? []) as unknown as RenewalPolicy[];

        const [paymentStatusesResult, policyStatusesResult] =
          await Promise.all([
            schedules.length > 0
              ? supabase
                  .from("payment_followups")
                  .select("payment_schedule_id, status")
                  .in(
                    "payment_schedule_id",
                    schedules.map((item) => item.id),
                  )
              : Promise.resolve({ data: [], error: null }),

            policies.length > 0
              ? supabase
                  .from("policy_followups")
                  .select("policy_id, status")
                  .in(
                    "policy_id",
                    policies.map((item) => item.id),
                  )
              : Promise.resolve({ data: [], error: null }),
          ]);

        if (paymentStatusesResult.error) {
          throw paymentStatusesResult.error;
        }

        if (policyStatusesResult.error) {
          throw policyStatusesResult.error;
        }

        const paymentStatuses =
          (paymentStatusesResult.data ?? []) as PaymentFollowupStatus[];

        const policyStatuses =
          (policyStatusesResult.data ?? []) as PolicyFollowupStatus[];

        const paymentStatusById = new Map(
          paymentStatuses.map((item) => [
            item.payment_schedule_id,
            item.status,
          ]),
        );

        const policyStatusById = new Map(
          policyStatuses.map((item) => [
            item.policy_id,
            item.status,
          ]),
        );

        const remainingPayments = schedules
          .map((schedule) => {
            const policy = getRelation(schedule.policies);
            const customer = getCustomer(policy);

            const amountDue = Number(schedule.amount_due) || 0;
            const allocated = (
              schedule.transaction_allocations ?? []
            ).reduce(
              (sum, item) =>
                sum + signedAllocation(item),
              0,
            );

            return {
              ...schedule,
              policy,
              customer,
              outstanding: Math.max(0, amountDue - allocated),
            };
          })
          .filter(
            (item) =>
              !item.paid &&
              item.outstanding > 0 &&
              paymentStatusById.get(item.id) !== "paid",
          );

        const remainingRenewals = policies
          .filter((policy) => policyStatusById.get(policy.id) !== "done")
          .map((policy) => ({
            ...policy,
            customer: getCustomer(policy),
          }));

        if (!cancelled) {
          setPayments(remainingPayments);
          setRenewals(remainingRenewals);
        }
      } catch (error) {
        console.error("Dashboard follow-ups error:", error);

        if (!cancelled) {
          setLoadError(
            "بارگذاری پیگیری‌ها ناموفق بود. لطفاً صفحه را دوباره بارگذاری کنید.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFollowups();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setLoggingOut(false);
      alert("خروج ناموفق بود. لطفاً دوباره تلاش کنید.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <AppShell>
      <header className="sticky top-0 z-10 flex h-[88px] items-center justify-between gap-3 border-b border-slate-100 bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black text-slate-900 sm:text-xl">
  داشبورد
</h2>
<p className="mt-1 text-xs font-medium text-slate-500">
  {formatDate(getToday())}
</p>

        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-2 rounded-xl border border-red-100 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {loggingOut ? "در حال خروج..." : "خروج"}
        </button>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-8 p-4 sm:p-7 lg:p-10">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            پیگیری‌های پیش رو
          </h3>
        </div>

        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Upcoming renewals */}
          <section className={`${cardClass} hover:shadow-indigo-100/50`}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Icon name="calendar" size={23} />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900">
                    بیمه‌نامه‌های سررسید
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    بیمه‌نامه‌های در انتظار پیگیری تا ۱۰ روز آینده
                  </p>
                </div>
              </div>

              <span className="rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600">
                {loading ? "…" : formatMoney(renewals.length)} مورد
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-[265px] items-center justify-center text-sm text-slate-400">
                در حال بارگذاری...
              </div>
            ) : renewals.length === 0 ? (
              <div className="flex min-h-[265px] flex-col items-center justify-center px-5 py-8 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-indigo-50 text-indigo-300">
                  <Icon name="calendar" size={36} />
                </div>
                <h5 className="font-bold text-slate-700">
                  بیمه‌نامه‌ای برای پیگیری وجود ندارد
                </h5>
              </div>
            ) : (
              <div className="max-h-[440px] overflow-y-auto">
                {renewals.map((policy) => (
                  <div key={policy.id} className={itemClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800">
                          {policy.customer?.full_name ?? "—"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                         {policy.policy_type}
                        </p>

                      </div>
                      <span className="shrink-0 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
                        {formatDate(policy.end_date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <a
                href="/policies"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-indigo-600 transition hover:bg-indigo-50"
              >
                مشاهده بیمه‌نامه‌ها
                <span className="inline-block rotate-180">
                  <Icon name="arrow" size={17} />
                </span>
              </a>
            </div>
          </section>

          {/* Upcoming payments */}
          <section className={`${cardClass} hover:shadow-orange-100/50`}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                  <Icon name="wallet" size={23} />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900">
                    پرداخت‌های پیش رو
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    اقساط در انتظار پیگیری تا ۳ روز آینده
                  </p>
                </div>
              </div>

              <span className="rounded-xl bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600">
                {loading ? "…" : formatMoney(payments.length)} مورد
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-[265px] items-center justify-center text-sm text-slate-400">
                در حال بارگذاری...
              </div>
            ) : payments.length === 0 ? (
              <div className="flex min-h-[265px] flex-col items-center justify-center px-5 py-8 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-orange-50 text-orange-300">
                  <Icon name="wallet" size={36} />
                </div>
                <h5 className="font-bold text-slate-700">
                  پرداختی برای پیگیری وجود ندارد
                </h5>
              </div>
            ) : (
              <div className="max-h-[440px] overflow-y-auto">
                {payments.map((payment) => (
                  <div key={payment.id} className={itemClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800">
                          {payment.customer?.full_name ?? "—"}
                        </p>

                        <p className="mt-2 text-sm font-bold text-red-600">
                          مانده: {formatMoney(payment.outstanding)} تومان
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
                        {formatDate(payment.due_date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <a
                href="/accounting"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-orange-600 transition hover:bg-orange-50"
              >
                مشاهده حسابداری
                <span className="inline-block rotate-180">
                  <Icon name="arrow" size={17} />
                </span>
              </a>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}