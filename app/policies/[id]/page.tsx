"use client";

import AppShell from "../../components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTodayJalali,
  jalaliTextToISO,
  toJalaliDisplay,
  toJalaliKey,
} from "@/lib/jalali-date";

type PolicyData = {
  id: string;
  customer_id: string;
  policy_number: string;
  policy_type: string;
  issue_date: string;
  start_date: string;
  end_date: string;
  total_price: number | string;
  payment_type: string;
  cash_amount: number | string;
  installment_count: number;
  first_installment_date: string | null;
};

type CustomerData = {
  id: string;
  full_name: string;
  id_number: string;
  mobile: string | null;
  address: string | null;
};

type Payment = {
  id: string;
  policy_id: string;
  sequence_number: number;
  description: string;
  amount_due: number | string;
  due_date: string;
};

type Transaction = {
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

type Allocation = {
  id: string;
  transaction_id: string;
  schedule_id: string;
  allocated_amount: number | string;
};

type TransactionType = "payment" | "discount";

type TransactionForm = {
  amount: string;
  payment_method: string;
  transaction_type: TransactionType;
  description: string;
};

type EditForm = {
  amount: string;
  dateText: string;
  payment_method: string;
  description: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("fa-IR").format(
    Math.round(Number.isFinite(value) ? value : 0)
  );

const initialForm = (): TransactionForm => ({
  amount: "",
  payment_method: "نقدی",
  transaction_type: "payment",
  description: "",
});

const transactionTypeLabel = (type: Transaction["transaction_type"]) => {
  switch (type) {
    case "payment":
      return "پرداخت";
    case "discount":
      return "تخفیف";
    case "reversal":
      return "برگشت تراکنش";
  }
};

// Supabase errors are plain objects, not Error instances.
function getErrorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return fallback;
}

export default function PolicyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState<TransactionForm>(initialForm);
  const [transactionDateText, setTransactionDateText] = useState(() =>
    getTodayJalali()
  );

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    amount: "",
    dateText: "",
    payment_method: "نقدی",
    description: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: policyData, error: policyError } = await supabase
        .from("policies")
        .select(
          "id, customer_id, policy_number, policy_type, issue_date, start_date, end_date, total_price, payment_type, cash_amount, installment_count, first_installment_date"
        )
        .eq("id", id)
        .maybeSingle();

      if (policyError) throw policyError;

      if (!policyData) {
        setPolicy(null);
        setCustomer(null);
        setPayments([]);
        setTransactions([]);
        setAllocations([]);
        return;
      }

      const [
        { data: customerData, error: customerError },
        { data: paymentData, error: paymentError },
        { data: transactionData, error: transactionError },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id, full_name, id_number, mobile, address")
          .eq("id", policyData.customer_id)
          .maybeSingle(),

        supabase
          .from("payment_schedule")
          .select(
            "id, policy_id, sequence_number, description, amount_due, due_date"
          )
          .eq("policy_id", id)
          .order("sequence_number", { ascending: true }),

        supabase
          .from("transactions")
          .select(
            "id, policy_id, payment_date, amount, transaction_type, payment_method, description, reverses_transaction_id, created_at"
          )
          .eq("policy_id", id)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (customerError) throw customerError;
      if (paymentError) throw paymentError;
      if (transactionError) throw transactionError;

      const policyTransactions = (transactionData ?? []) as Transaction[];
      const transactionIds = policyTransactions.map((t) => t.id);

      // Only fetch allocations that belong to this policy's transactions.
      let policyAllocations: Allocation[] = [];

      if (transactionIds.length > 0) {
        const { data: allocationData, error: allocationError } =
          await supabase
            .from("transaction_allocations")
            .select("id, transaction_id, schedule_id, allocated_amount")
            .in("transaction_id", transactionIds);

        if (allocationError) throw allocationError;
        policyAllocations = (allocationData ?? []) as Allocation[];
      }

      setPolicy(policyData as PolicyData);
      setCustomer(customerData as CustomerData | null);
      setPayments((paymentData ?? []) as Payment[]);
      setTransactions(policyTransactions);
      setAllocations(policyAllocations);
    } catch (cause) {
      setError(
        getErrorMessage(cause, "دریافت اطلاعات بیمه‌نامه ناموفق بود.")
      );
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const transactionById = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions]
  );

  // IDs of transactions that have been reversed (i.e. edited or cancelled).
  const reversedIds = useMemo(
    () =>
      new Set(
        transactions
          .map((t) => t.reverses_transaction_id)
          .filter((value): value is string => Boolean(value))
      ),
    [transactions]
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
        (totals.get(allocation.schedule_id) ?? 0) + signedAmount
      );
    }

    return totals;
  }, [allocations, transactionById]);

  const getScheduleAmounts = useCallback(
    (payment: Payment) => {
      const due = Math.max(0, Number(payment.amount_due) || 0);
      const allocated = allocatedBySchedule.get(payment.id) ?? 0;
      const paid = Math.min(due, Math.max(0, allocated));
      const remaining = Math.max(0, due - paid);

      return { due, paid, remaining };
    },
    [allocatedBySchedule]
  );

  const total = Number(policy?.total_price) || 0;

  // Net amount recorded: payments and discounts add, reversals subtract.
  const netRecordedAmount = transactions.reduce((sum, transaction) => {
    const amount = Number(transaction.amount) || 0;
    return (
      sum + (transaction.transaction_type === "reversal" ? -amount : amount)
    );
  }, 0);

  // Paid / discount totals, with reversals subtracted from the right bucket.
  const { paidAmount, discountAmount } = useMemo(() => {
    let paid = 0;
    let discount = 0;

    for (const t of transactions) {
      const amount = Number(t.amount) || 0;

      if (t.transaction_type === "payment") {
        paid += amount;
      } else if (t.transaction_type === "discount") {
        discount += amount;
      } else {
        const original = t.reverses_transaction_id
          ? transactionById.get(t.reverses_transaction_id)
          : undefined;

        if (original?.transaction_type === "payment") paid -= amount;
        else if (original?.transaction_type === "discount")
          discount -= amount;
      }
    }

    return { paidAmount: paid, discountAmount: discount };
  }, [transactions, transactionById]);

  const outstanding = Math.max(0, total - netRecordedAmount);

  const updateForm = <K extends keyof TransactionForm>(
    key: K,
    value: TransactionForm[K]
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  async function registerTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || saving) return;

    setError("");
    setSuccess("");

    const amount = Number(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("مبلغ تراکنش باید بیشتر از صفر باشد.");
      return;
    }

    const paymentDate = jalaliTextToISO(transactionDateText);

    if (!paymentDate) {
      setError("تاریخ تراکنش نامعتبر است.");
      return;
    }

    if (form.transaction_type === "discount") {
      if (form.payment_method !== "تخفیف") {
        setError("روش پرداخت برای تراکنش تخفیف باید «تخفیف» باشد.");
        return;
      }
    } else if (form.payment_method === "تخفیف") {
      setError("برای ثبت پرداخت، یک روش پرداخت غیر از «تخفیف» انتخاب کنید.");
      return;
    }

    setSaving(true);

    try {
      const { error: transactionError } = await supabase.rpc(
        "record_policy_transaction",
        {
          p_policy_id: policy.id,
          p_amount: amount,
          p_payment_date: paymentDate,
          p_payment_method: form.payment_method,
          p_transaction_type: form.transaction_type,
          p_description: form.description.trim() || null,
        }
      );

      if (transactionError) throw transactionError;

      setSuccess(
        form.transaction_type === "discount"
          ? "تخفیف با موفقیت ثبت شد."
          : "پرداخت با موفقیت ثبت شد."
      );
      setForm(initialForm());
      setTransactionDateText(getTodayJalali());

      await loadDetails();
    } catch (cause) {
      setError(getErrorMessage(cause, "ثبت تراکنش ناموفق بود."));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(transaction: Transaction) {
    setError("");
    setSuccess("");
    setEditing(transaction);
    setEditForm({
      amount: String(Number(transaction.amount) || ""),
      dateText: toJalaliKey(transaction.payment_date) ?? "",
      payment_method: transaction.payment_method,
      description: transaction.description ?? "",
    });
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || editSaving) return;

    const amount = Number(editForm.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("مبلغ تراکنش باید بیشتر از صفر باشد.");
      return;
    }

    const paymentDate = jalaliTextToISO(editForm.dateText);

    if (!paymentDate) {
      setError("تاریخ تراکنش نامعتبر است.");
      return;
    }

    setEditSaving(true);
    setError("");
    setSuccess("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "edit_policy_transaction",
        {
          p_transaction_id: editing.id,
          p_amount: amount,
          p_payment_date: paymentDate,
          p_payment_method: editForm.payment_method,
          p_description: editForm.description.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      setEditing(null);
      setSuccess("تراکنش با موفقیت ویرایش شد.");
      await loadDetails();
    } catch (cause) {
      setError(getErrorMessage(cause, "ویرایش تراکنش ناموفق بود."));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <AppShell>
      <main
        dir="rtl"
        className="min-h-screen bg-[#F6F7FC] p-4 text-slate-800 md:p-8"
      >
        <div className="mx-auto max-w-6xl space-y-6">
          <button
            type="button"
            onClick={() => router.push("/policies")}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50"
          >
            ← بازگشت به فهرست بیمه‌نامه‌ها
          </button>

          {loading && (
            <div className="rounded-2xl bg-white p-8 text-center">
              در حال دریافت اطلاعات بیمه‌نامه...
            </div>
          )}

          {error && (
            <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {success}
            </div>
          )}

          {!loading && !policy && !error && (
            <div className="rounded-2xl bg-white p-8 text-center">
              بیمه‌نامه موردنظر پیدا نشد.
            </div>
          )}

          {!loading && policy && (
            <>
              <section className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm md:p-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500">جزئیات بیمه‌نامه</p>
                    <h1 className="mt-2 text-2xl font-extrabold">
                      {policy.policy_number}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                      {policy.policy_type}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/policies")}
                    className="rounded-xl bg-[#001427] px-4 py-3 text-sm font-bold text-white hover:bg-[#17354a]"
                  >
                    بازگشت به مدیریت
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["تاریخ صدور", policy.issue_date],
                    ["تاریخ شروع", policy.start_date],
                    ["تاریخ پایان", policy.end_date],
                    ["نحوه پرداخت", policy.payment_type],
                    [
                      "مبلغ نقدی",
                      `${money(Number(policy.cash_amount) || 0)} تومان`,
                    ],
                    ["تعداد اقساط", money(policy.installment_count || 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-[#f7f9f8] p-4">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-2 break-words font-bold">
                        {value || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm md:p-7">
                <h2 className="text-lg font-extrabold">اطلاعات بیمه‌گذار</h2>

                {customer ? (
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      ["نام و نام خانوادگی", customer.full_name],
                      ["کد ملی", customer.id_number],
                      ["شماره تماس", customer.mobile || "—"],
                      ["آدرس", customer.address || "—"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="mt-1 break-words font-semibold">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    اطلاعات بیمه‌گذار پیدا نشد.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm md:p-7">
                <h2 className="text-lg font-extrabold">خلاصه وضعیت مالی</h2>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">مبلغ کل بیمه‌نامه</p>
                    <p className="mt-2 text-xl font-extrabold">
                      {money(total)} تومان
                    </p>
                  </div>

                  <div className="rounded-xl bg-emerald-50 p-4">
                    <p className="text-sm text-emerald-700">
                      مجموع پرداخت‌های ثبت‌شده
                    </p>
                    <p className="mt-2 text-xl font-extrabold text-emerald-800">
                      {money(paidAmount)} تومان
                    </p>
                    {discountAmount > 0 && (
                      <p className="mt-1 text-xs text-emerald-700">
                        تخفیف ثبت‌شده: {money(discountAmount)} تومان
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-sm text-amber-700">مانده قابل پرداخت</p>
                    <p className="mt-2 text-xl font-extrabold text-amber-800">
                      {money(outstanding)} تومان
                    </p>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#e7ece9] bg-white shadow-sm">
                <div className="border-b border-[#edf0ee] p-5 md:p-7">
                  <h2 className="text-lg font-extrabold">جزئیات اقساط</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    وضعیت اقساط بر اساس تراکنش‌های ثبت‌شده و مبالغ تخصیص‌یافته
                    محاسبه می‌شود.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-right text-sm">
                    <thead className="bg-[#f7f9f8] text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-4">ردیف</th>
                        <th className="px-5 py-4">شرح قسط</th>
                        <th className="px-5 py-4">تاریخ سررسید</th>
                        <th className="px-5 py-4">مبلغ قسط</th>
                        <th className="px-5 py-4">پرداخت‌شده</th>
                        <th className="px-5 py-4">مانده قسط</th>
                        <th className="px-5 py-4">وضعیت</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#edf0ee]">
                      {payments.map((payment) => {
                        const amounts = getScheduleAmounts(payment);
                        const isPaid = amounts.remaining <= 0;
                        const isPartiallyPaid =
                          amounts.paid > 0 && amounts.remaining > 0;

                        return (
                          <tr key={payment.id} className="hover:bg-slate-50">
                            <td className="px-5 py-4">
                              {money(payment.sequence_number + 1)}
                            </td>
                            <td className="px-5 py-4 font-semibold">
                              {payment.description || "—"}
                            </td>
                            <td className="px-5 py-4" dir="ltr">
                              {toJalaliDisplay(payment.due_date)}
                            </td>
                            <td className="px-5 py-4 font-bold">
                              {money(amounts.due)}
                            </td>
                            <td className="px-5 py-4 text-emerald-700">
                              {money(amounts.paid)}
                            </td>
                            <td className="px-5 py-4 font-bold">
                              {money(amounts.remaining)}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                                  isPaid
                                    ? "bg-emerald-50 text-emerald-700"
                                    : isPartiallyPaid
                                      ? "bg-sky-50 text-sky-700"
                                      : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {isPaid
                                  ? "تسویه‌شده"
                                  : isPartiallyPaid
                                    ? "پرداخت ناقص"
                                    : "پرداخت‌نشده"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {payments.length === 0 && (
                    <p className="p-8 text-center text-sm text-slate-500">
                      برای این بیمه‌نامه هیچ قسطی ثبت نشده است.
                    </p>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#e7ece9] bg-white shadow-sm">
                <div className="border-b border-[#edf0ee] p-5 md:p-7">
                  <h2 className="text-lg font-extrabold">جزئیات پرداخت‌ها</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    فهرست تراکنش‌های واقعی ثبت‌شده برای این بیمه‌نامه.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-right text-sm">
                    <thead className="bg-[#f7f9f8] text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-4">ردیف</th>
                        <th className="px-5 py-4">تاریخ</th>
                        <th className="px-5 py-4">نوع تراکنش</th>
                        <th className="px-5 py-4">روش پرداخت</th>
                        <th className="px-5 py-4">مبلغ (تومان)</th>
                        <th className="px-5 py-4">شرح</th>
                        <th className="px-5 py-4">عملیات</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#edf0ee]">
                      {transactions.map((transaction, index) => {
                        const isReversed = reversedIds.has(transaction.id);
                        const canEdit =
                          transaction.transaction_type !== "reversal" &&
                          !isReversed;

                        return (
                          <tr
                            key={transaction.id}
                            className={`hover:bg-slate-50 ${
                              isReversed ? "text-slate-400" : ""
                            }`}
                          >
                            <td className="px-5 py-4">{money(index + 1)}</td>
                            <td className="px-5 py-4" dir="ltr">
                              {toJalaliDisplay(transaction.payment_date)}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                                  transaction.transaction_type === "payment"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : transaction.transaction_type ===
                                        "discount"
                                      ? "bg-sky-50 text-sky-700"
                                      : "bg-red-50 text-red-700"
                                }`}
                              >
                                {transactionTypeLabel(
                                  transaction.transaction_type
                                )}
                              </span>
                              {isReversed && (
                                <span className="mr-2 text-xs">
                                  (ویرایش‌شده)
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {transaction.payment_method}
                            </td>
                            <td
                              className={`px-5 py-4 font-bold ${
                                isReversed ? "line-through" : ""
                              }`}
                            >
                              {money(Number(transaction.amount) || 0)}
                            </td>
                            <td className="max-w-xs whitespace-normal px-5 py-4">
                              {transaction.description || "—"}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(transaction)}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-100"
                                >
                                  ویرایش
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {transactions.length === 0 && (
                    <p className="p-8 text-center text-sm text-slate-500">
                      هنوز تراکنشی برای این بیمه‌نامه ثبت نشده است.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm md:p-7">
                <h2 className="text-lg font-extrabold">ثبت تراکنش جدید</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  مبلغ واردشده طبق ترتیب سررسید به اقساط دارای مانده تخصیص
                  داده می‌شود. ثبت تراکنش از طریق سیستم حسابداری موجود انجام
                  می‌شود.
                </p>

                <form onSubmit={registerTransaction} className="mt-6 space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label
                        htmlFor="transaction_type"
                        className="mb-2 block text-sm font-bold"
                      >
                        نوع تراکنش
                      </label>
                      <select
                        id="transaction_type"
                        value={form.transaction_type}
                        onChange={(event) => {
                          const type = event.target.value as TransactionType;
                          setForm((previous) => ({
                            ...previous,
                            transaction_type: type,
                            payment_method:
                              type === "discount"
                                ? "تخفیف"
                                : previous.payment_method === "تخفیف"
                                  ? "نقدی"
                                  : previous.payment_method,
                          }));
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                      >
                        <option value="payment">پرداخت</option>
                        <option value="discount">تخفیف</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="transaction_amount"
                        className="mb-2 block text-sm font-bold"
                      >
                        مبلغ (تومان)
                      </label>
                      <input
                        id="transaction_amount"
                        type="number"
                        min="1"
                        step="any"
                        required
                        value={form.amount}
                        onChange={(event) =>
                          updateForm("amount", event.target.value)
                        }
                        placeholder="مبلغ تراکنش"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="transaction_date"
                        className="mb-2 block text-sm font-bold"
                      >
                        تاریخ تراکنش
                      </label>
                      <input
                        id="transaction_date"
                        type="text"
                        required
                        inputMode="numeric"
                        placeholder="۱۴۰۵/۰۸/۰۵"
                        value={transactionDateText}
                        onChange={(event) =>
                          setTransactionDateText(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="payment_method"
                        className="mb-2 block text-sm font-bold"
                      >
                        روش پرداخت
                      </label>
                      <select
                        id="payment_method"
                        required
                        value={form.payment_method}
                        onChange={(event) =>
                          updateForm("payment_method", event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                      >
                        {form.transaction_type === "discount" ? (
                          <option value="تخفیف">تخفیف</option>
                        ) : (
                          <>
                            <option value="نقدی">نقدی</option>
                            <option value="کارتخوان">کارتخوان</option>
                            <option value="کارت به کارت">کارت به کارت</option>
                            <option value="مستقیم">مستقیم</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="transaction_description"
                        className="mb-2 block text-sm font-bold"
                      >
                        شرح تراکنش (اختیاری)
                      </label>
                      <input
                        id="transaction_description"
                        type="text"
                        value={form.description}
                        onChange={(event) =>
                          updateForm("description", event.target.value)
                        }
                        placeholder="توضیحات مربوط به پرداخت یا تخفیف"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={saving || loading}
                      className="rounded-xl bg-[#001427] px-6 py-3 text-sm font-bold text-white hover:bg-[#17354a] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving
                        ? "در حال ثبت تراکنش..."
                        : form.transaction_type === "discount"
                          ? "ثبت تخفیف"
                          : "ثبت پرداخت"}
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setForm(initialForm());
                        setTransactionDateText(getTodayJalali());
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                    >
                      پاک کردن فرم
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>

        {editing && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !editSaving) {
                setEditing(null);
              }
            }}
          >
            <form
              onSubmit={submitEdit}
              className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"
            >
              <h2 className="text-lg font-extrabold">
                ویرایش {transactionTypeLabel(editing.transaction_type)}
              </h2>
              <p className="text-xs leading-6 text-slate-500">
                تراکنش قبلی برگشت داده می‌شود و تراکنش اصلاح‌شده جایگزین آن
                می‌شود.
              </p>

              {error && (
                <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-bold">
                  مبلغ (تومان)
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={editForm.amount}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      amount: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  تاریخ تراکنش
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  value={editForm.dateText}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      dateText: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                />
              </div>

              {editing.transaction_type === "payment" && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    روش پرداخت
                  </label>
                  <select
                    value={editForm.payment_method}
                    onChange={(event) =>
                      setEditForm((previous) => ({
                        ...previous,
                        payment_method: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                  >
                    <option value="نقدی">نقدی</option>
                    <option value="کارتخوان">کارتخوان</option>
                    <option value="کارت به کارت">کارت به کارت</option>
                    <option value="مستقیم">مستقیم</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-bold">شرح</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-xl bg-[#001427] px-6 py-3 text-sm font-bold text-white hover:bg-[#17354a] disabled:opacity-50"
                >
                  {editSaving ? "در حال ذخیره..." : "ذخیره تغییرات"}
                </button>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => setEditing(null)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </AppShell>
  );
}
