
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import { createClient } from "@/lib/supabase/client";
import {
  getTodayJalali,
  jalaliTextToISO,
  toJalaliDisplay,
  toJalaliKey,
} from "@/lib/jalali-date";

type CustomerRow = {
  id: string;
  full_name: string | null;
  id_number: string | null;
  mobile: string | null;
  address: string | null;
};

type PolicyRow = {
  id: string;
  customer_id: string;
  policy_number: string | null;
  policy_type: string | null;
  issue_date: string | null;
  start_date: string | null;
  end_date: string | null;
  total_price: number | string | null;
  payment_type: string | null;
  cash_amount: number | string | null;
  installment_count: number | null;
  first_installment_date: string | null;
  created_at?: string;
};

type ScheduleRow = {
  id: string;
  policy_id: string;
  sequence_number: number;
  description: string | null;
  amount_due: number | string | null;
  due_date: string | null;
  paid: boolean | null;
};

type TransactionRow = {
  id: string;
  policy_id: string;
  payment_date: string;
  amount: number | string;
  transaction_type: "payment" | "discount" | "reversal";
  payment_method: string;
  description: string | null;
  reverses_transaction_id: string | null;
  created_at: string;
};

type AllocationRow = {
  id: string;
  transaction_id: string;
  schedule_id: string;
  allocated_amount: number | string;
};

type PolicyListItem = PolicyRow & {
  customer_name: string;
  customer_mobile: string;
  customer_national_id: string;
  customer_address: string;
};

type TransactionType = "payment" | "discount";

type TransactionForm = {
  payment_date: string;
  amount: string;
  transaction_type: TransactionType;
  payment_method: string;
  description: string;
};

const PAGE_SIZE = 10;

const paymentMethods = [
  "مستقیم",
  "نقدی",
  "کارتخوان",
  "کارت به کارت",
  "تخفیف",
];

const inputClass =
  "w-full min-h-11 rounded-xl border border-primary/15 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-secondary focus:ring-2 focus:ring-secondary/20";

const sectionClass =
  "overflow-hidden rounded-2xl border border-primary/10 shadow-sm";

const tableHeadClass =
  "bg-primary/[0.045] text-foreground/70";

const tableCellClass = "px-5 py-4";

function formatMoney(value: number | string | null | undefined) {
  return `${new Intl.NumberFormat("fa-IR").format(Number(value) || 0)} تومان`;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("fa-IR").format(Number(value) || 0);
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function normalizeSearch(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)),
    )
    .replace(/[٠-٩]/g, (digit) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
    )
    .trim()
    .toLowerCase();
}

function policyTypeStyle(type: string | null) {
  switch (type?.trim()) {
    case "شخص ثالث":
      return "border-primary/15 bg-primary text-primary-foreground";
    case "بدنه":
      return "border-secondary/30 bg-secondary/15 text-foreground";
    case "آتش‌سوزی":
    case "آتش سوزی":
      return "border-accent/40 bg-accent/15 text-foreground";
    case "مسئولیت":
      return "border-secondary/30 bg-secondary/15 text-foreground";
    case "موتور":
      return "border-secondary/30 bg-secondary/15 text-foreground";
    case "باربری":
      return "border-accent/30 bg-accent/10 text-foreground";
    default:
      return "border-primary/15 bg-background text-foreground";
  }
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-primary/10 bg-background p-3.5">
      <p className="mb-1.5 text-xs text-foreground/60">{label}</p>
      <p className="break-words text-sm font-medium leading-6 text-foreground">
        {displayValue(value)}
      </p>
    </div>
  );
}

function transactionTypeLabel(type: TransactionRow["transaction_type"]) {
  if (type === "discount") return "تخفیف";
  if (type === "reversal") return "برگشت تراکنش";
  return "پرداخت";
}

function statusStyle(status: string) {
  if (status === "تسویه شده") {
    return "border-secondary/30 bg-secondary/15 text-foreground";
  }

  if (status === "معوق") {
    return "border-danger/25 bg-danger/10 text-danger";
  }

  if (status === "سررسید امروز") {
    return "border-accent/40 bg-accent/15 text-foreground";
  }

  return "border-primary/10 bg-primary/[0.03] text-foreground/70";
}

export default function AccountingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [policies, setPolicies] = useState<PolicyListItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedPolicy, setSelectedPolicy] =
    useState<PolicyListItem | null>(null);

  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"policy" | "transactions">(
    "transactions",
  );
  const [showAllDebtors, setShowAllDebtors] = useState(false);

  const [form, setForm] = useState<TransactionForm>({
    payment_date: getTodayJalali(),
    amount: "",
    transaction_type: "payment",
    payment_method: "نقدی",
    description: "",
  });

  const [savingTransaction, setSavingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const [
        { data: customerRows, error: customersError },
        { data: policyRows, error: policiesError },
        { data: scheduleRows, error: scheduleError },
        { data: transactionRows, error: transactionsError },
        { data: allocationRows, error: allocationsError },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id, full_name, id_number, mobile, address")
          .order("full_name"),

        supabase
          .from("policies")
          .select(
            "id, customer_id, policy_number, policy_type, issue_date, start_date, end_date, total_price, payment_type, cash_amount, installment_count, first_installment_date, created_at",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("payment_schedule")
          .select(
            "id, policy_id, sequence_number, description, amount_due, due_date, paid",
          )
          .order("sequence_number", { ascending: true }),

        supabase
          .from("transactions")
          .select(
            "id, policy_id, payment_date, amount, transaction_type, payment_method, description, reverses_transaction_id, created_at",
          )
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false }),

        supabase
          .from("transaction_allocations")
          .select("id, transaction_id, schedule_id, allocated_amount"),
      ]);

      if (customersError) throw customersError;
      if (policiesError) throw policiesError;
      if (scheduleError) throw scheduleError;
      if (transactionsError) throw transactionsError;
      if (allocationsError) throw allocationsError;

      const customers = (customerRows ?? []) as CustomerRow[];
      const policyData = (policyRows ?? []) as PolicyRow[];

      const mappedPolicies: PolicyListItem[] = policyData.map((policy) => {
        const customer = customers.find(
          (item) => item.id === policy.customer_id,
        );

        return {
          ...policy,
          customer_name: customer?.full_name ?? "مشتری نامشخص",
          customer_mobile: customer?.mobile ?? "",
          customer_national_id: customer?.id_number ?? "",
          customer_address: customer?.address ?? "",
        };
      });

      setPolicies(mappedPolicies);
      setSchedule((scheduleRows ?? []) as ScheduleRow[]);
      setTransactions((transactionRows ?? []) as TransactionRow[]);
      setAllocations((allocationRows ?? []) as AllocationRow[]);
    } catch (error) {
      console.error("Failed to load accounting data:", error);

      setPageError(
        error instanceof Error
          ? error.message
          : "دریافت اطلاعات حسابداری با خطا مواجه شد.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const transactionById = useMemo(
    () => new Map(transactions.map((item) => [item.id, item])),
    [transactions],
  );

  const allocatedBySchedule = useMemo(() => {
    const totals = new Map<string, number>();

    for (const allocation of allocations) {
      const transaction = transactionById.get(allocation.transaction_id);
      if (!transaction) continue;

      const amount = Number(allocation.allocated_amount) || 0;

      const signedAmount =
        transaction.transaction_type === "reversal" ? -amount : amount;

      totals.set(
        allocation.schedule_id,
        (totals.get(allocation.schedule_id) ?? 0) + signedAmount,
      );
    }

    return totals;
  }, [allocations, transactionById]);

  function getScheduleAmounts(item: ScheduleRow) {
    const due = Math.max(0, Number(item.amount_due) || 0);
    const allocated = allocatedBySchedule.get(item.id) ?? 0;
    const paid = Math.min(due, Math.max(0, allocated));
    const remaining = Math.max(0, due - paid);

    return { due, paid, remaining };
  }

  // Today as a Jalali key ("1405/08/06"), the same format as due_date.
  // Recomputed whenever data is (re)loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayKey = useMemo(() => getTodayJalali(), [schedule]);

  function getScheduleStatus(item: ScheduleRow) {
    const { remaining } = getScheduleAmounts(item);

    // Fully paid (or discounted) installments are never debt.
    if (remaining <= 0) return "تسویه شده";

    const dueKey = toJalaliKey(item.due_date);
    if (!dueKey) return "بدون تاریخ سررسید";

    // Only installments whose due date has passed AND still have a
    // remaining balance count as overdue.
    if (dueKey < todayKey) return "معوق";
    if (dueKey === todayKey) return "سررسید امروز";

    return "سررسید نشده";
  }

  const overdueByPolicy = useMemo(() => {
    const totals = new Map<string, number>();

    for (const item of schedule) {
      if (getScheduleStatus(item) !== "معوق") continue;

      const { remaining } = getScheduleAmounts(item);
      if (remaining <= 0) continue;

      totals.set(
        item.policy_id,
        (totals.get(item.policy_id) ?? 0) + remaining,
      );
    }

    return totals;
  }, [schedule, allocatedBySchedule, todayKey]);

  const debtors = useMemo(
    () =>
      policies
        .filter((policy) => (overdueByPolicy.get(policy.id) ?? 0) > 0)
        .sort(
          (a, b) =>
            (overdueByPolicy.get(b.id) ?? 0) -
            (overdueByPolicy.get(a.id) ?? 0),
        ),
    [policies, overdueByPolicy],
  );

  const visibleDebtors = showAllDebtors ? debtors : debtors.slice(0, 10);

  const filteredPolicies = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);

    if (!normalizedSearch) return policies;

    return policies.filter((policy) =>
      [
        policy.customer_name,
        policy.customer_mobile,
        policy.customer_national_id,
        policy.policy_number,
        policy.policy_type,
      ].some((value) =>
        normalizeSearch(value).includes(normalizedSearch),
      ),
    );
  }, [policies, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPolicies.length / PAGE_SIZE),
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPolicies = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;

    return filteredPolicies.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredPolicies, safeCurrentPage]);

  const selectedSchedule = useMemo(
    () =>
      selectedPolicy
        ? schedule
            .filter((item) => item.policy_id === selectedPolicy.id)
            .sort(
              (a, b) =>
                a.sequence_number - b.sequence_number ||
                (a.due_date ?? "").localeCompare(b.due_date ?? ""),
            )
        : [],
    [schedule, selectedPolicy],
  );

  const selectedTransactions = useMemo(
    () =>
      selectedPolicy
        ? transactions.filter(
            (item) => item.policy_id === selectedPolicy.id,
          )
        : [],
    [transactions, selectedPolicy],
  );

  function openPolicyDetails(
    policy: PolicyListItem,
    mode: "policy" | "transactions",
  ) {
    setSelectedPolicy(policy);
    setDetailMode(mode);

    setForm({
      payment_date: getTodayJalali(),
      amount: "",
      transaction_type: "payment",
      payment_method: "نقدی",
      description: "",
    });

    setTransactionError("");
    setTransactionSuccess("");
    setDetailPanelOpen(true);
  }

  function closePolicyDetails() {
    setDetailPanelOpen(false);
    setTransactionError("");
    setTransactionSuccess("");
  }

  useEffect(() => {
    if (!detailPanelOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailPanelOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailPanelOpen]);

  function updateForm<K extends keyof TransactionForm>(
    key: K,
    value: TransactionForm[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "transaction_type") {
        next.payment_method = value === "discount" ? "تخفیف" : "نقدی";
      }

      if (key === "payment_method" && value === "تخفیف") {
        next.transaction_type = "discount";
      } else if (
        key === "payment_method" &&
        value !== "تخفیف" &&
        current.transaction_type === "discount"
      ) {
        next.transaction_type = "payment";
      }

      return next;
    });
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPolicy) return;

    setTransactionError("");
    setTransactionSuccess("");

    const amount = Number(
      form.amount.replace(/[,\u066C]/g, "").trim(),
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      setTransactionError("مبلغ باید عددی بزرگ‌تر از صفر باشد.");
      return;
    }

    // The form holds a Jalali date; the database stores Gregorian ISO.
    const paymentDateISO = jalaliTextToISO(form.payment_date);

    if (!paymentDateISO) {
      setTransactionError(
        "تاریخ تراکنش را به‌صورت شمسی معتبر وارد کنید؛ مانند ۱۴۰۵/۰۸/۰۵.",
      );
      return;
    }

    if (
      form.transaction_type === "discount" &&
      form.payment_method !== "تخفیف"
    ) {
      setTransactionError("روش تراکنش تخفیف باید «تخفیف» باشد.");
      return;
    }

    if (
      form.transaction_type === "payment" &&
      form.payment_method === "تخفیف"
    ) {
      setTransactionError("برای ثبت تخفیف، نوع تراکنش را تغییر دهید.");
      return;
    }

    setSavingTransaction(true);

    try {
      const { error } = await supabase.rpc("record_policy_transaction", {
        p_policy_id: selectedPolicy.id,
        p_amount: amount,
        p_payment_date: paymentDateISO,
        p_payment_method: form.payment_method,
        p_transaction_type: form.transaction_type,
        p_description: form.description.trim() || null,
      });

      if (error) throw error;

      setTransactionSuccess("تراکنش با موفقیت ثبت شد.");

      setForm({
        payment_date: getTodayJalali(),
        amount: "",
        transaction_type: "payment",
        payment_method: "نقدی",
        description: "",
      });

      await loadData();
    } catch (error) {
      console.error("Failed to record transaction:", error);

      setTransactionError(
        error instanceof Error
          ? error.message
          : "ثبت تراکنش ناموفق بود. دوباره تلاش کنید.",
      );
    } finally {
      setSavingTransaction(false);
    }
  }

  return (
    <AppShell>
      <main
        dir="rtl"
        className="min-h-full bg-background p-4 text-foreground sm:p-6 lg:p-8"
      >
        <div className="mx-auto w-full max-w-7xl space-y-7">
          {/* Page heading */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-primary">
                حسابداری
              </h1>
              <p className="mt-2 text-sm leading-6 text-foreground/60">
                مدیریت بدهی‌ها، اقساط و تراکنش‌های بیمه‌نامه‌ها
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => void loadData()}
              disabled={loading}
            >
              {loading ? "در حال دریافت..." : "به‌روزرسانی اطلاعات"}
            </Button>
          </header>

          {/* Debtors section */}
          <section
            className={`${sectionClass} border-[#FECACA]/60 bg-[#FEF2F2]`}
          >
            <div className="flex flex-col gap-4 border-b border-[#FECACA]/50 bg-[#FEE2E2]/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FECACA]/50 text-[#B91C1C]">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 8v5m0 3h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h2 className="text-lg font-bold text-primary">
                    بدهکاران
                  </h2>
                </div>

                <p className="mt-2 text-sm leading-6 text-foreground/65">
                  بیمه‌نامه‌هایی که قسط معوق و تسویه‌نشده دارند
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!loading && (
                  <span className="rounded-full border border-secondary/30 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground">
                    {formatNumber(debtors.length)} بدهکار
                  </span>
                )}

                {debtors.length > 10 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setShowAllDebtors((current) => !current)
                    }
                  >
                    {showAllDebtors ? "نمایش کمتر" : "نمایش همه"}
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-foreground/60">
                در حال دریافت اطلاعات...
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-right text-sm">
                    <thead className="bg-white/60 text-foreground/70">
                      <tr>
                        <th className={tableCellClass}>نام مشتری</th>
                        <th className={tableCellClass}>شماره بیمه‌نامه</th>
                        <th className={tableCellClass}>نوع بیمه</th>
                        <th className={tableCellClass}>بدهی معوق</th>
                        <th className={`${tableCellClass} text-center`}>
                          عملیات
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-secondary/15">
                      {visibleDebtors.map((policy) => (
                        <tr
                          key={policy.id}
                          className="transition-colors hover:bg-[#FEE2E2]/60"
                        >
                          <td className={tableCellClass}>
                            <p className="font-semibold text-foreground">
                              {policy.customer_name}
                            </p>
                            <p className="mt-1 text-xs text-foreground/60">
                              {policy.customer_mobile ||
                                "شماره تماس ثبت نشده"}
                            </p>
                          </td>

                          <td className={tableCellClass}>
                            {displayValue(policy.policy_number)}
                          </td>

                          <td className={tableCellClass}>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${policyTypeStyle(policy.policy_type)}`}
                            >
                              {displayValue(policy.policy_type)}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 font-bold text-danger">
                            {formatMoney(overdueByPolicy.get(policy.id))}
                          </td>

                          <td className={`${tableCellClass} text-center`}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                openPolicyDetails(policy, "transactions")
                              }
                            >
                              تراکنش‌ها
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {debtors.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-10 text-center text-sm text-foreground/60"
                          >
                            در حال حاضر بدهی معوقی ثبت نشده است.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {debtors.length > 10 && (
                  <div className="border-t border-secondary/20 px-5 py-3 text-xs text-foreground/60">
                    نمایش {formatNumber(visibleDebtors.length)} مورد از{" "}
                    {formatNumber(debtors.length)} بدهکار
                  </div>
                )}
              </>
            )}
          </section>

          {/* Policy list section */}
          <section
            className={`${sectionClass} border-accent/20 bg-[#FFFBF5]`}
          >
            <div className="flex flex-col gap-5 border-b border-accent/20 bg-accent/[0.055] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-primary">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path
                        d="M7 3.75h7l5 5v11.5H7a2 2 0 0 1-2-2v-12a2.5 2.5 0 0 1 2-2.5Z"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 4v5h5M9 13h6M9 16.5h6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h2 className="text-lg font-bold text-primary">
                    فهرست بیمه‌نامه‌ها
                  </h2>
                </div>

                <p className="mt-2 text-sm text-foreground/65">
                  تعداد کل: {formatNumber(filteredPolicies.length)} بیمه‌نامه
                </p>
              </div>

              <div className="w-full lg:max-w-lg">
                <label
                  htmlFor="policy-search"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  جست‌وجوی بیمه‌نامه
                </label>

                <div className="relative">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground/40"
                    aria-hidden="true"
                  >
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path
                      d="m16 16 4.2 4.2"
                      strokeLinecap="round"
                    />
                  </svg>

                  <input
                    id="policy-search"
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="نام، شماره تماس، کد ملی یا شماره بیمه‌نامه"
                    className={`${inputClass} pr-11`}
                  />
                </div>
              </div>
            </div>

            {pageError && (
              <div className="m-5 rounded-xl border border-danger/25 bg-danger/[0.06] p-4 text-sm leading-6">
                <p className="font-semibold text-danger">
                  دریافت اطلاعات ناموفق بود.
                </p>
                <p className="mt-1 break-words text-foreground/80">
                  {pageError}
                </p>
                <div className="mt-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void loadData()}
                  >
                    تلاش مجدد
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center text-sm text-foreground/60">
                در حال دریافت فهرست بیمه‌نامه‌ها...
              </div>
            ) : !pageError && paginatedPolicies.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-primary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6"
                    aria-hidden="true"
                  >
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path
                      d="m16 16 4.2 4.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <p className="mt-4 font-semibold text-foreground">
                  بیمه‌نامه‌ای پیدا نشد.
                </p>
                <p className="mt-2 text-sm text-foreground/60">
                  عبارت جست‌وجو را تغییر دهید یا فهرست را بررسی کنید.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-right text-sm">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className={tableCellClass}>نام مشتری</th>
                        <th className={tableCellClass}>شماره بیمه‌نامه</th>
                        <th className={tableCellClass}>نوع بیمه‌نامه</th>
                        <th className={tableCellClass}>مبلغ بیمه‌نامه</th>
                        <th className={`${tableCellClass} text-center`}>
                          عملیات
                        </th>
                        <th className={tableCellClass}>.</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-primary/10">
                      {paginatedPolicies.map((policy) => (
                        <tr
                          key={policy.id}
                          className="transition-colors hover:bg-accent/[0.045]"
                        >
                          <td className={tableCellClass}>
                            <p className="font-semibold text-foreground">
                              {policy.customer_name}
                            </p>
                            <p className="mt-1 text-xs text-foreground/60">
                              {policy.customer_mobile ||
                                "شماره تماس ثبت نشده"}
                            </p>
                          </td>

                          <td
                            className={`${tableCellClass} font-medium text-foreground`}
                          >
                            {displayValue(policy.policy_number)}
                          </td>

                          <td className={tableCellClass}>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${policyTypeStyle(policy.policy_type)}`}
                            >
                              {displayValue(policy.policy_type)}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 font-medium text-foreground">
                            {formatMoney(policy.total_price)}
                          </td>

                          <td className={`${tableCellClass} text-center`}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openPolicyDetails(policy, "policy")
                              }
                            >
                              نمایش بیمه‌نامه
                            </Button>
                          </td>
                          <td className={`${tableCellClass} text-center`}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                openPolicyDetails(policy, "transactions")
                              }
                            >
                              تراکنش‌ها
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-4 border-t border-accent/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-foreground/60">
                    نمایش{" "}
                    {formatNumber(
                      filteredPolicies.length === 0
                        ? 0
                        : (safeCurrentPage - 1) * PAGE_SIZE + 1,
                    )}{" "}
                    تا{" "}
                    {formatNumber(
                      Math.min(
                        safeCurrentPage * PAGE_SIZE,
                        filteredPolicies.length,
                      ),
                    )}{" "}
                    از {formatNumber(filteredPolicies.length)} مورد
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage <= 1}
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                    >
                      قبلی
                    </Button>

                    <span className="min-w-24 text-center text-sm text-foreground/70">
                      صفحه {formatNumber(safeCurrentPage)} از{" "}
                      {formatNumber(totalPages)}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(totalPages, page + 1),
                        )
                      }
                    >
                      بعدی
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Policy details drawer */}
      {detailPanelOpen && selectedPolicy && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="بستن پنجره جزئیات بیمه‌نامه"
            onClick={closePolicyDetails}
            className="absolute inset-0 h-full w-full bg-primary/45 backdrop-blur-[3px]"
          />

          <aside
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-detail-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col border-l border-primary/10 bg-background text-foreground shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-primary/10 bg-primary/[0.025] p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground/55">
                  حسابداری بیمه‌نامه
                </p>

                <h2
                  id="policy-detail-title"
                  className="mt-2 break-words text-xl font-bold text-primary"
                >
                  بیمه‌نامه{" "}
                  {displayValue(selectedPolicy.policy_number)}
                </h2>

                <p className="mt-2 text-sm text-foreground/65">
                  {selectedPolicy.customer_name}
                </p>
              </div>

              <button
                type="button"
                onClick={closePolicyDetails}
                aria-label="بستن"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 text-2xl text-foreground/65 transition-colors hover:border-secondary/40 hover:bg-secondary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                ×
              </button>
            </header>

            <div className="flex-1 space-y-7 overflow-y-auto p-5 sm:p-6">
              {/* Customer information */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-primary">
                  <span className="h-5 w-1 rounded-full bg-secondary" />
                  اطلاعات بیمه‌گذار
                </h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="نام و نام خانوادگی"
                    value={selectedPolicy.customer_name}
                  />
                  <Field
                    label="شماره همراه"
                    value={selectedPolicy.customer_mobile}
                  />
                  <Field
                    label="کد ملی"
                    value={selectedPolicy.customer_national_id}
                  />
                  <Field
                    label="آدرس"
                    value={selectedPolicy.customer_address}
                  />
                </div>
              </section>

              {/* Policy information */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-primary">
                  <span className="h-5 w-1 rounded-full bg-accent" />
                  اطلاعات بیمه‌نامه
                </h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="شماره بیمه‌نامه"
                    value={selectedPolicy.policy_number}
                  />
                  <Field
                    label="نوع بیمه‌نامه"
                    value={selectedPolicy.policy_type}
                  />
                  <Field
                    label="تاریخ صدور"
                    value={selectedPolicy.issue_date}
                  />
                  <Field
                    label="تاریخ شروع"
                    value={selectedPolicy.start_date}
                  />
                  <Field
                    label="تاریخ پایان"
                    value={selectedPolicy.end_date}
                  />
                  <Field
                    label="مبلغ کل بیمه‌نامه"
                    value={formatMoney(selectedPolicy.total_price)}
                  />
                  <Field
                    label="روش پرداخت"
                    value={selectedPolicy.payment_type}
                  />
                  <Field
                    label="مبلغ پرداخت نقدی اولیه"
                    value={formatMoney(selectedPolicy.cash_amount)}
                  />
                  <Field
                    label="تعداد اقساط"
                    value={formatNumber(selectedPolicy.installment_count)}
                  />
                  <Field
                    label="تاریخ اولین قسط"
                    value={selectedPolicy.first_installment_date}
                  />
                </div>
              </section>

              {/* Installment schedule */}
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-base font-bold text-primary">
                    <span className="h-5 w-1 rounded-full bg-secondary" />
                    برنامه پرداخت و اقساط
                  </h3>

                  <span className="rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1 text-xs text-foreground/70">
                    {formatNumber(selectedSchedule.length)} مورد
                  </span>
                </div>

                {selectedSchedule.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-primary/20 bg-primary/[0.02] p-5 text-center text-sm leading-6 text-foreground/60">
                    برای این بیمه‌نامه، موردی در برنامه پرداخت ثبت نشده است.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-primary/10 bg-background">
                    <table className="w-full min-w-[610px] text-right text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-3 py-3 font-semibold">عنوان</th>
                          <th className="px-3 py-3 font-semibold">مبلغ قسط</th>
                          <th className="px-3 py-3 font-semibold">پرداخت‌شده</th>
                          <th className="px-3 py-3 font-semibold">مانده</th>
                          <th className="px-3 py-3 font-semibold">سررسید</th>
                          <th className="px-3 py-3 font-semibold">وضعیت</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-primary/10">
                        {selectedSchedule.map((item) => {
                          const amounts = getScheduleAmounts(item);
                          const status = getScheduleStatus(item);

                          return (
                            <tr
                              key={item.id}
                              className="transition-colors hover:bg-secondary/[0.04]"
                            >
                              <td className="px-3 py-3 font-medium">
                                {item.description ||
                                  (item.sequence_number === 0
                                    ? "پرداخت نقدی"
                                    : `قسط ${formatNumber(item.sequence_number)}`)}
                              </td>

                              <td className="whitespace-nowrap px-3 py-3">
                                {formatMoney(amounts.due)}
                              </td>

                              <td className="whitespace-nowrap px-3 py-3">
                                {formatMoney(amounts.paid)}
                              </td>

                              <td className="whitespace-nowrap px-3 py-3 font-medium">
                                {formatMoney(amounts.remaining)}
                              </td>

                              <td className="whitespace-nowrap px-3 py-3">
                                {toJalaliDisplay(item.due_date)}
                              </td>

                              <td className="px-3 py-3">
                                <span
                                  className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(status)}`}
                                >
                                  {status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mt-2 text-xs leading-6 text-foreground/55">
                  مانده اقساط از روی تراکنش‌های ثبت‌شده محاسبه می‌شود؛ وضعیت
                  «معوق» فقط برای اقساط پرداخت‌نشده‌ای است که تاریخ سررسیدشان
                  قبل از امروز باشد.
                </p>
              </section>

              {/* New transaction */}
              {detailMode === "transactions" && (
                <section className="rounded-2xl border border-secondary/25 bg-[#F0FAF8] p-4 sm:p-5">
                  <div className="mb-5 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/20 text-primary">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 5v14M5 12h14"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <h3 className="text-base font-bold text-primary">
                      ثبت تراکنش جدید
                    </h3>
                  </div>

                  <form onSubmit={submitTransaction} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="transaction-type"
                          className="mb-2 block text-sm font-medium"
                        >
                          نوع تراکنش
                        </label>

                        <select
                          id="transaction-type"
                          value={form.transaction_type}
                          onChange={(event) =>
                            updateForm(
                              "transaction_type",
                              event.target.value as TransactionType,
                            )
                          }
                          className={inputClass}
                        >
                          <option value="payment">دریافت وجه</option>
                          <option value="discount">تخفیف</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="transaction_date"
                          className="mb-2 block text-sm font-medium"
                        >
                          تاریخ تراکنش (شمسی)
                        </label>

                        <input
                          id="transaction_date"
                          type="text"
                          required
                          inputMode="numeric"
                          dir="ltr"
                          placeholder="۱۴۰۵/۰۸/۰۵"
                          value={form.payment_date}
                          onChange={(event) =>
                            updateForm("payment_date", event.target.value)
                          }
                          className={`${inputClass} text-left`}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="transaction-amount"
                          className="mb-2 block text-sm font-medium"
                        >
                          مبلغ (تومان)
                        </label>

                        <input
                          id="transaction-amount"
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={form.amount}
                          onChange={(event) =>
                            updateForm("amount", event.target.value)
                          }
                          placeholder="مبلغ را وارد کنید"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="transaction-method"
                          className="mb-2 block text-sm font-medium"
                        >
                          روش پرداخت
                        </label>

                        <select
                          id="transaction-method"
                          value={form.payment_method}
                          onChange={(event) =>
                            updateForm("payment_method", event.target.value)
                          }
                          className={inputClass}
                        >
                          {paymentMethods.map((method) => (
                            <option
                              key={method}
                              value={method}
                              disabled={
                                form.transaction_type === "payment" &&
                                method === "تخفیف"
                              }
                            >
                              {method}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="transaction-description"
                        className="mb-2 block text-sm font-medium"
                      >
                        توضیحات (اختیاری)
                      </label>

                      <textarea
                        id="transaction-description"
                        rows={2}
                        value={form.description}
                        onChange={(event) =>
                          updateForm("description", event.target.value)
                        }
                        placeholder="شماره رسید یا توضیحات تراکنش"
                        className={`${inputClass} min-h-0 resize-y`}
                      />
                    </div>

                    {transactionError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm leading-6 text-danger"
                      >
                        {transactionError}
                      </div>
                    )}

                    {transactionSuccess && (
                      <div
                        role="status"
                        className="rounded-xl border border-secondary/30 bg-secondary/15 p-3 text-sm leading-6 text-foreground"
                      >
                        {transactionSuccess}
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      fullWidth
                      disabled={savingTransaction}
                    >
                      {savingTransaction
                        ? "در حال ثبت..."
                        : "ثبت تراکنش"}
                    </Button>

                    <p className="text-xs leading-6 text-foreground/55">
                      مبلغ به‌صورت خودکار به قدیمی‌ترین مانده قابل پرداخت
                      تخصیص داده می‌شود. مبلغ بیش از مانده برنامه پرداخت
                      پذیرفته نمی‌شود.
                    </p>
                  </form>
                </section>
              )}

              {/* Transaction history */}
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-base font-bold text-primary">
                    <span className="h-5 w-1 rounded-full bg-accent" />
                    تاریخچه تراکنش‌ها
                  </h3>

                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-foreground/70">
                    {formatNumber(selectedTransactions.length)} تراکنش
                  </span>
                </div>

                {selectedTransactions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-primary/20 bg-primary/[0.02] p-5 text-center text-sm leading-6 text-foreground/60">
                    هنوز تراکنشی برای این بیمه‌نامه ثبت نشده است.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-primary/10 bg-background">
                    <table className="w-full min-w-[570px] text-right text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-3 py-3 font-semibold">تاریخ</th>
                          <th className="px-3 py-3 font-semibold">نوع</th>
                          <th className="px-3 py-3 font-semibold">مبلغ</th>
                          <th className="px-3 py-3 font-semibold">روش</th>
                          <th className="px-3 py-3 font-semibold">توضیحات</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-primary/10">
                        {selectedTransactions.map((transaction) => (
                          <tr
                            key={transaction.id}
                            className="transition-colors hover:bg-secondary/[0.04]"
                          >
                            <td className="whitespace-nowrap px-3 py-3">
                              {toJalaliDisplay(transaction.payment_date)}
                            </td>

                            <td className="px-3 py-3">
                              {transactionTypeLabel(
                                transaction.transaction_type,
                              )}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3 font-medium">
                              {formatMoney(transaction.amount)}
                            </td>

                            <td className="whitespace-nowrap px-3 py-3">
                              {transaction.payment_method}
                            </td>

                            <td className="max-w-[180px] break-words px-3 py-3">
                              {displayValue(transaction.description)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mt-2 text-xs leading-6 text-foreground/55">
                  تراکنش‌های مالی در این صفحه حذف نمی‌شوند. اصلاح یا برگشت
                  تراکنش باید از طریق فرایند جداگانه و قابل پیگیری انجام شود.
                </p>
              </section>
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-primary/10 bg-background p-5 sm:p-6">
              <Button variant="primary" onClick={closePolicyDetails}>
                بستن
              </Button>
            </footer>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
