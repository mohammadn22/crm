
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import AppShell from "../components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { toGregorian, toJalaali } from "jalaali-js";

type Relation<T> = T | T[] | null;

type Customer = {
  full_name: string;
  mobile: string;
};

type Policy = {
  id?: string;
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

type CustomerRow = {
  id: string;
  full_name: string | null;
  mobile: string | null;
};

type PolicyRow = {
  id: string;
  customer_id: string;
  policy_number: string | null;
  policy_type: string | null;
};

type ScheduleRow = {
  id: string;
  policy_id: string;
  amount_due: number | string | null;
  due_date: string | null;
  paid: boolean | null;
};

type TransactionRow = {
  id: string;
  transaction_type: "payment" | "discount" | "reversal";
};

type AllocationRow = {
  transaction_id: string;
  schedule_id: string;
  allocated_amount: number | string;
};

type Debtor = {
  id: string;
  customer_name: string;
  customer_mobile: string;
  policy_number: string | null;
  policy_type: string | null;
  overdue: number;
};

type FollowupStatus = {
  payment_schedule_id: string;
  status: string;
};

type RenewalFollowupStatus = {
  policy_id: string;
  status: string;
};

type SmsHistoryRow = {
  row_type: "payment" | "renewal" | "debtor";
  row_id: string;
};

type SmsRowType = "payment" | "renewal" | "debtor";

type SelectedSms = {
  rowType: SmsRowType;
  rowId: string;
  phone: string;
  message: string;
};

function getRelation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function signedAllocation(item: Allocation): number {
  const amount = Number(item.allocated_amount) || 0;
  const transaction = getRelation(item.transactions);

  return transaction?.transaction_type === "reversal"
    ? -amount
    : amount;
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

function makeJalaliDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
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

  return new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(gy, gm - 1, gd)));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getCustomer(policy: Policy | RenewalPolicy | null) {
  return policy ? getRelation(policy.customers) : null;
}

function SendSmsButton({
  onClick,
  sent,
}: {
  onClick: () => void;
  sent: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-secondary/20"
    >
      {sent && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-4 w-4 text-secondary"
          aria-label="ارسال شده"
        >
          <path d="m5 12 4 4L19 6" />
        </svg>
      )}

      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      </svg>

      ارسال پیامک
    </button>
  );
}

function TableSection({
  title,
  description,
  count,
  accent,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  count: number;
  accent: "red" | "gold" | "green";
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const accentStyles = {
    red: {
      bar: "bg-danger",
      badge: "bg-danger/10 text-danger",
    },
    gold: {
      bar: "bg-accent",
      badge: "bg-accent/15 text-foreground",
    },
    green: {
      bar: "bg-secondary",
      badge: "bg-secondary/15 text-foreground",
    },
  };

  const style = accentStyles[accent];

  return (
    <section className="overflow-hidden rounded-xl border border-primary/10 bg-background shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-right transition-colors hover:bg-primary/[0.025] sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-8 w-1 shrink-0 rounded-full ${style.bar}`} />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-primary sm:text-base">
              {title}
            </h2>
            <p className="mt-1 text-xs text-foreground/55">
              {description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${style.badge}`}>
            {formatNumber(count)} مورد
          </span>

          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-5 w-5 text-foreground/50 transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {open && children}
        </div>
      </div>
    </section>
  );
}

const tableHead =
  "whitespace-nowrap px-3 py-3 text-xs font-bold text-foreground/65";

const tableCell = "px-3 py-3 text-sm align-middle";

const tableWrapper = "overflow-x-auto";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-foreground/55">
      {message}
    </div>
  );
}

export default function SmsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [paymentSchedules, setPaymentSchedules] = useState<PaymentSchedule[]>([]);
  const [renewalPolicies, setRenewalPolicies] = useState<RenewalPolicy[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [smsHistory, setSmsHistory] = useState<SmsHistoryRow[]>([]);
  const [selectedSms, setSelectedSms] = useState<SelectedSms | null>(null);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState("");

  const [expanded, setExpanded] = useState({
    payments: true,
    renewals: true,
    debtors: true,
  });

  const toggleSection = (section: keyof typeof expanded) => {
    setExpanded((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const openSmsPreview = (
    rowType: SmsRowType,
    rowId: string,
    phone: string,
    message: string,
  ) => {
    setSmsError("");
    setSelectedSms({ rowType, rowId, phone, message });
  };

  const wasSmsSent = (
    rowType: SmsRowType,
    rowId: string,
  ) =>
    smsHistory.some(
      (item) => item.row_type === rowType && item.row_id === rowId,
    );

  const sendSms = async () => {
    if (!selectedSms || sendingSms) return;

    setSendingSms(true);
    setSmsError("");

    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(selectedSms),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.accepted) {
          setSmsError(
            "پیامک توسط سامانه پذیرفته شد، اما ذخیره سابقه آن ناموفق بود. پیش از ارسال مجدد، وضعیت پیامک را بررسی کنید.",
          );
          return;
        }

        throw new Error(result.error || "ارسال پیامک ناموفق بود.");
      }

      setSmsHistory((current) => [
        ...current,
        {
          row_type: selectedSms.rowType,
          row_id: selectedSms.rowId,
        },
      ]);

      setSelectedSms(null);
    } catch (error) {
      setSmsError(
        error instanceof Error
          ? error.message
          : "در ارسال پیامک خطایی رخ داد.",
      );
    } finally {
      setSendingSms(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      // SMS history
      const { data: historyData, error: historyError } = await supabase
        .from("sms_history")
        .select("row_type, row_id");

      if (historyError) throw historyError;

      setSmsHistory((historyData ?? []) as SmsHistoryRow[]);

      // -------------------------------------------------
      // 1. Payment and renewal data (Follow-up page)
      // -------------------------------------------------

      const today = getToday();
      const paymentEndDate = addDays(today, 3);
      const renewalEndDate = addDays(today, 10);

      const [
        { data: paymentData, error: paymentError },
        { data: renewalData, error: renewalError },
      ] = await Promise.all([
        supabase
          .from("payment_schedule")
          .select(`
            id,
            amount_due,
            due_date,
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

      if (paymentError) throw paymentError;
      if (renewalError) throw renewalError;

      const paymentRows =
        (paymentData ?? []) as unknown as PaymentSchedule[];

      const renewalRows =
        (renewalData ?? []) as unknown as RenewalPolicy[];

      // Payment follow-up statuses
      const scheduleIds = paymentRows.map((item) => item.id);
      let paymentStatuses: FollowupStatus[] = [];

      if (scheduleIds.length > 0) {
        const { data, error } = await supabase
          .from("payment_followups")
          .select("payment_schedule_id, status")
          .in("payment_schedule_id", scheduleIds);

        if (error) throw error;
        paymentStatuses = (data ?? []) as FollowupStatus[];
      }

      const paymentStatusById = new Map(
        paymentStatuses.map((item) => [
          item.payment_schedule_id,
          item.status,
        ]),
      );

      const outstandingPayments = paymentRows
        .map((schedule) => {
          const amountDue = Number(schedule.amount_due) || 0;

          const allocated = (schedule.transaction_allocations ?? []).reduce(
            (sum, item) => sum + signedAllocation(item),
            0,
          );

          return {
            ...schedule,
            outstanding: Math.max(0, amountDue - allocated),
            savedStatus: paymentStatusById.get(schedule.id) ?? null,
          };
        })
        .filter(
          (item) =>
            !item.paid &&
            item.outstanding > 0 &&
            item.savedStatus !== "paid",
        );

      // Renewal follow-up statuses
      const renewalIds = renewalRows.map((item) => item.id);
      let renewalStatuses: RenewalFollowupStatus[] = [];

      if (renewalIds.length > 0) {
        const { data, error } = await supabase
          .from("policy_followups")
          .select("policy_id, status")
          .in("policy_id", renewalIds);

        if (error) throw error;
        renewalStatuses = (data ?? []) as RenewalFollowupStatus[];
      }

      const renewalStatusById = new Map(
        renewalStatuses.map((item) => [item.policy_id, item.status]),
      );

      const filteredRenewals = renewalRows.filter(
        (policy) => renewalStatusById.get(policy.id) !== "done",
      );

      setPaymentSchedules(outstandingPayments as PaymentSchedule[]);
      setRenewalPolicies(filteredRenewals);

      // -------------------------------------------------
      // 2. Debtors data (Accounting page)
      // -------------------------------------------------

      const [
        { data: customerRows, error: customersError },
        { data: policyRows, error: policiesError },
        { data: scheduleRows, error: scheduleError },
        { data: transactionRows, error: transactionsError },
        { data: allocationRows, error: allocationsError },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id, full_name, mobile")
          .order("full_name"),

        supabase
          .from("policies")
          .select("id, customer_id, policy_number, policy_type")
          .order("policy_number"),

        supabase
          .from("payment_schedule")
          .select("id, policy_id, amount_due, due_date, paid")
          .order("due_date", { ascending: true }),

        supabase
          .from("transactions")
          .select("id, transaction_type"),

        supabase
          .from("transaction_allocations")
          .select("transaction_id, schedule_id, allocated_amount"),
      ]);

      if (customersError) throw customersError;
      if (policiesError) throw policiesError;
      if (scheduleError) throw scheduleError;
      if (transactionsError) throw transactionsError;
      if (allocationsError) throw allocationsError;

      const customers = (customerRows ?? []) as CustomerRow[];
      const policies = (policyRows ?? []) as PolicyRow[];
      const schedules = (scheduleRows ?? []) as ScheduleRow[];
      const transactions = (transactionRows ?? []) as TransactionRow[];
      const allocations = (allocationRows ?? []) as AllocationRow[];

      const customerById = new Map(
        customers.map((customer) => [customer.id, customer]),
      );

      const transactionById = new Map(
        transactions.map((transaction) => [transaction.id, transaction]),
      );

      const allocatedBySchedule = new Map<string, number>();

      for (const allocation of allocations) {
        const transaction = transactionById.get(allocation.transaction_id);
        if (!transaction) continue;

        const amount = Number(allocation.allocated_amount) || 0;

        const signedAmount =
          transaction.transaction_type === "reversal" ? -amount : amount;

        allocatedBySchedule.set(
          allocation.schedule_id,
          (allocatedBySchedule.get(allocation.schedule_id) ?? 0) +
            signedAmount,
        );
      }

      const todayKey = getToday();
      const overdueByPolicy = new Map<string, number>();

      for (const item of schedules) {
        if (!item.due_date) continue;

        const dueKey = item.due_date;
        const amountDue = Number(item.amount_due) || 0;

        const remaining = Math.max(
          0,
          amountDue -
            Math.min(
              Math.max(0, amountDue),
              Math.max(0, allocatedBySchedule.get(item.id) ?? 0),
            ),
        );

        if (remaining <= 0 || dueKey >= todayKey) continue;

        overdueByPolicy.set(
          item.policy_id,
          (overdueByPolicy.get(item.policy_id) ?? 0) + remaining,
        );
      }

      const debtorRows: Debtor[] = policies
        .map((policy) => {
          const customer = customerById.get(policy.customer_id);

          return {
            id: policy.id,
            customer_name: customer?.full_name ?? "مشتری نامشخص",
            customer_mobile: customer?.mobile ?? "",
            policy_number: policy.policy_number,
            policy_type: policy.policy_type,
            overdue: overdueByPolicy.get(policy.id) ?? 0,
          };
        })
        .filter((policy) => policy.overdue > 0)
        .sort((a, b) => b.overdue - a.overdue);

      setDebtors(debtorRows);
    } catch (error) {
      console.error("Failed to load SMS page data:", error);

      setPageError(
        error instanceof Error
          ? error.message
          : "دریافت اطلاعات با خطا مواجه شد.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AppShell>
      <main
        dir="rtl"
        className="min-h-full bg-background p-3 text-foreground sm:p-5 lg:p-6"
      >
        <div className="mx-auto w-full max-w-7xl space-y-5">
          {/* Page heading */}
          <header className="relative overflow-hidden rounded-xl bg-primary px-5 py-5 text-primary-foreground sm:px-6">
            <div className="absolute -left-10 -top-14 h-36 w-36 rounded-full bg-secondary/15 blur-2xl" />
            <div className="absolute -bottom-16 right-1/3 h-32 w-32 rounded-full bg-accent/15 blur-2xl" />

            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-primary-foreground/70">
                  <span className="h-2 w-2 rounded-full bg-secondary" />
                  ارتباط با مشتریان
                </div>
                <h1 className="text-xl font-bold sm:text-2xl">
                  ارسال پیامک
                </h1>
                <p className="mt-1 text-xs text-primary-foreground/65">
                  مدیریت پیامک‌های اقساط، تمدید و بدهی مشتریان
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                {loading ? "در حال دریافت..." : "به‌روزرسانی اطلاعات"}
              </button>
            </div>
          </header>

          {pageError && (
            <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
              {pageError}
            </div>
          )}

          {/* 1. Payment installments */}
          <TableSection
            title="اقساط پرداخت‌نشده"
            description="سررسید امروز تا سه روز آینده"
            count={paymentSchedules.length}
            accent="gold"
            open={expanded.payments}
            onToggle={() => toggleSection("payments")}
          >
            {loading ? (
              <EmptyState message="در حال دریافت اطلاعات..." />
            ) : paymentSchedules.length === 0 ? (
              <EmptyState message="در این بازه قسط پرداخت‌نشده‌ای پیدا نشد." />
            ) : (
              <div className={tableWrapper}>
                <table className="w-full min-w-[730px] text-right">
                  <thead className="bg-primary/[0.035]">
                    <tr className="border-y border-primary/10">
                      <th className={tableHead}>مشتری</th>
                      <th className={tableHead}>بیمه‌نامه</th>
                      <th className={tableHead}>سررسید</th>
                      <th className={tableHead}>مانده پرداخت</th>
                      <th className={tableHead}>عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/10">
                    {paymentSchedules.map((item) => {
                      const policy = getRelation(item.policies);
                      const customer = getCustomer(policy);

                      const outstanding = Math.max(
                        0,
                        Number(item.amount_due) -
                          (item.transaction_allocations ?? []).reduce(
                            (sum, allocation) =>
                              sum + signedAllocation(allocation),
                            0,
                          ),
                      );

                      return (
                        <tr
                          key={item.id}
                          className="transition-colors hover:bg-secondary/[0.045]"
                        >
                          <td className={tableCell}>
                            <div className="whitespace-nowrap font-semibold">
                              {customer?.full_name ?? "—"}
                            </div>
                            <div className="mt-0.5 text-xs text-foreground/55">
                              {customer?.mobile ?? "شماره ثبت نشده"}
                            </div>
                          </td>
                          <td className={tableCell}>
                            <div className="whitespace-nowrap font-medium">
                              {policy?.policy_number ?? "—"}
                            </div>
                            <div className="mt-0.5 text-xs text-foreground/55">
                              {policy?.policy_type ?? ""}
                            </div>
                          </td>
                          <td className={tableCell}>
                            <span className="whitespace-nowrap rounded-md bg-accent/15 px-2 py-1 text-xs font-semibold">
                              {formatDate(item.due_date)}
                            </span>
                          </td>
                          <td className={tableCell}>
                            <div className="whitespace-nowrap font-bold tabular-nums text-danger">
                              {formatNumber(outstanding)}
                            </div>
                            <div className="text-[11px] text-foreground/50">
                              تومان
                            </div>
                          </td>
                          <td className={tableCell}>
                            <SendSmsButton
                              sent={wasSmsSent("payment", item.id)}
                              onClick={() =>
                                openSmsPreview(
                                  "payment",
                                  item.id,
                                  customer?.mobile ?? "",
                                  `مالک محترم بیمه شماره ${policy?.policy_number ?? "—"}، قسط مورخ ${formatDate(item.due_date)} شما به مبلغ ${formatNumber(outstanding)} تومان پرداخت نشده است. لطفا جهت پرداخت قسط با نمایندگی بیمه تماس حاصل فرمایید. با تشکر. بیمه ایران`,
                                )
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TableSection>

          {/* 2. Policies approaching renewal */}
          <TableSection
            title="بیمه‌نامه‌های نزدیک به تمدید"
            description="تاریخ انقضا تا ده روز آینده"
            count={renewalPolicies.length}
            accent="green"
            open={expanded.renewals}
            onToggle={() => toggleSection("renewals")}
          >
            {loading ? (
              <EmptyState message="در حال دریافت اطلاعات..." />
            ) : renewalPolicies.length === 0 ? (
              <EmptyState message="در این بازه بیمه‌نامه‌ای برای تمدید پیدا نشد." />
            ) : (
              <div className={tableWrapper}>
                <table className="w-full min-w-[730px] text-right">
                  <thead className="bg-primary/[0.035]">
                    <tr className="border-y border-primary/10">
                      <th className={tableHead}>مشتری</th>
                      <th className={tableHead}>بیمه‌نامه</th>
                      <th className={tableHead}>تاریخ انقضا</th>
                      <th className={tableHead}>تلفن تماس</th>
                      <th className={tableHead}>عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/10">
                    {renewalPolicies.map((policy) => {
                      const customer = getCustomer(policy);

                      return (
                        <tr
                          key={policy.id}
                          className="transition-colors hover:bg-secondary/[0.045]"
                        >
                          <td className={tableCell}>
                            <span className="whitespace-nowrap font-semibold">
                              {customer?.full_name ?? "—"}
                            </span>
                          </td>
                          <td className={tableCell}>
                            <div className="whitespace-nowrap font-medium">
                              {policy.policy_number}
                            </div>
                            <div className="mt-0.5 text-xs text-foreground/55">
                              {policy.policy_type}
                            </div>
                          </td>
                          <td className={tableCell}>
                            <span className="whitespace-nowrap rounded-md bg-secondary/15 px-2 py-1 text-xs font-semibold">
                              {formatDate(policy.end_date)}
                            </span>
                          </td>
                          <td className={tableCell}>
                            {customer?.mobile ? (
                              <a
                                href={`tel:${customer.mobile}`}
                                className="whitespace-nowrap font-semibold underline-offset-4 hover:text-secondary hover:underline"
                              >
                                {customer.mobile}
                              </a>
                            ) : (
                              <span className="text-foreground/40">—</span>
                            )}
                          </td>
                          <td className={tableCell}>
                            <SendSmsButton
                              sent={wasSmsSent("renewal", policy.id)}
                              onClick={() =>
                                openSmsPreview(
                                  "renewal",
                                  policy.id,
                                  customer?.mobile ?? "",
                                  `مشتری گرامی، بیمه شماره ${policy.policy_number} شما در تاریخ ${formatDate(policy.end_date)} به پایان میرسد. لطفا جهت تمدید با نمایندگی تماس حاصل فرمایید. با تشکر. نمایندگی یوسفی زاده`,
                                )
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TableSection>

          {/* 3. Debtors */}
          <TableSection
            title="بدهکاران"
            description="بیمه‌نامه‌هایی که قسط معوق و تسویه‌نشده دارند"
            count={debtors.length}
            accent="red"
            open={expanded.debtors}
            onToggle={() => toggleSection("debtors")}
          >
            {loading ? (
              <EmptyState message="در حال دریافت اطلاعات..." />
            ) : debtors.length === 0 ? (
              <EmptyState message="در حال حاضر بدهی معوقی ثبت نشده است." />
            ) : (
              <div className={tableWrapper}>
                <table className="w-full min-w-[650px] text-right">
                  <thead className="bg-danger/[0.045]">
                    <tr className="border-y border-danger/10">
                      <th className={tableHead}>نام مشتری</th>
                      <th className={tableHead}>شماره بیمه‌نامه</th>
                      <th className={tableHead}>بدهی معوق</th>
                      <th className={tableHead}>عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/10">
                    {debtors.map((policy) => (
                      <tr
                        key={policy.id}
                        className="transition-colors hover:bg-danger/[0.035]"
                      >
                        <td className={tableCell}>
                          <div className="whitespace-nowrap font-semibold">
                            {policy.customer_name}
                          </div>
                          <div className="mt-0.5 text-xs text-foreground/55">
                            {policy.customer_mobile || "شماره تماس ثبت نشده"}
                          </div>
                        </td>
                        <td className={tableCell}>
                          <div className="whitespace-nowrap font-medium">
                            {policy.policy_number ?? "—"}
                          </div>
                          <div className="mt-0.5 text-xs text-foreground/55">
                            {policy.policy_type ?? ""}
                          </div>
                        </td>
                        <td className={tableCell}>
                          <div className="whitespace-nowrap font-bold tabular-nums text-danger">
                            {formatNumber(policy.overdue)}
                          </div>
                          <div className="text-[11px] text-foreground/50">
                            تومان
                          </div>
                        </td>
                        <td className={tableCell}>
                          <SendSmsButton
                            sent={wasSmsSent("debtor", policy.id)}
                            onClick={() =>
                              openSmsPreview(
                                "debtor",
                                policy.id,
                                policy.customer_mobile,
                                `مشتری گرامی، بدهی معوقه بیمه‌نامه شما تا تاریخ ${formatDate(getToday())} مبلغ ${formatNumber(policy.overdue)} تومان میباشد. لطفا جهت پرداخت با نمایندگی تماس حاصل فرمایید. با تشکر. بیمه ایران.`,
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableSection>
        </div>

        {/* SMS preview modal */}
        {selectedSms && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/50 p-4 backdrop-blur-sm"
            onClick={() => {
              if (!sendingSms) {
                setSelectedSms(null);
                setSmsError("");
              }
            }}
          >
            <div
              dir="rtl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sms-preview-title"
              className="w-full max-w-lg rounded-2xl border border-primary/10 bg-background p-5 shadow-2xl sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2
                  id="sms-preview-title"
                  className="text-lg font-bold text-primary"
                >
                  پیش‌نمایش پیامک
                </h2>

                <button
                  type="button"
                  disabled={sendingSms}
                  onClick={() => {
                    setSelectedSms(null);
                    setSmsError("");
                  }}
                  className="rounded-lg p-2 text-foreground/50 transition hover:bg-primary/5 hover:text-primary disabled:opacity-40"
                  aria-label="بستن"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground/60">
                    شماره گیرنده
                  </label>

                  <div
                    className="rounded-lg border border-primary/10 bg-primary/[0.025] px-3 py-3 text-sm font-semibold"
                    dir="ltr"
                  >
                    {selectedSms.phone || "شماره موبایل ثبت نشده"}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground/60">
                    متن پیامک
                  </label>

                  <textarea
                    readOnly
                    value={selectedSms.message}
                    rows={6}
                    className="w-full resize-none rounded-lg border border-primary/10 bg-primary/[0.025] px-3 py-3 text-sm leading-8 text-foreground outline-none"
                  />
                </div>

                {smsError && (
                  <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs leading-6 text-danger">
                    {smsError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void sendSms()}
                    disabled={sendingSms || !selectedSms.phone.trim()}
                    className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingSms ? "در حال ارسال..." : "تأیید و ارسال پیامک"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSms(null);
                      setSmsError("");
                    }}
                    disabled={sendingSms}
                    className="rounded-lg border border-primary/15 px-4 py-3 text-sm font-semibold text-foreground/70 transition hover:bg-primary/5 disabled:opacity-50"
                  >
                    انصراف
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
