
"use client";

import AppShell from "../components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { parseJalaliTextToGregorianISO } from "@/lib/date-utils";
import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useState } from "react";

type ImportRow = {
  id: string;
  fingerprint: string;
  payment_date: string;
  date_text: string;
  payment_time: string;
  description: string;
  amount_rial: number | string;
  payer: string;
  p1: string;
  p2: string;
  assigned_policy_id: string | null;
  status: "unassigned" | "assigned" | "completed";
  transaction_id: string | null;
  created_at: string;
};

type PolicyOption = {
  id: string;
  policy_number: string;
  policy_type: string;
  total_price: number | string;
  customer_id: string;
  customer_name: string;
  id_number: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("fa-IR").format(
    Math.round(Number.isFinite(value) ? value : 0)
  );

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    )
    .replace(/[٠-٩]/g, (digit) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    )
    .replace(/\u200c/g, "")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s()[\]،,:_-]/g, "");
}

function parseNumber(value: unknown): number {
  const normalized = normalizeText(value)
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .replace(/[^\d.-]/g, "");

  return Number(normalized);
}

function getCell(
  row: Record<string, unknown>,
  alternatives: string[]
): string {
  const targetHeaders = alternatives.map(normalizeHeader);
  const key = Object.keys(row).find((header) =>
    targetHeaders.includes(normalizeHeader(header))
  );

  return key ? normalizeText(row[key]) : "";
}

async function makeFingerprint(values: string[]): Promise<string> {
  const input = values.join("\u001f");
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function OnlinePaymentPage() {
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [policyLabels, setPolicyLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selectedRow, setSelectedRow] = useState<ImportRow | null>(null);
  const [policySearch, setPolicySearch] = useState("");
  const [policyResults, setPolicyResults] = useState<PolicyOption[]>([]);
  const [searchingPolicies, setSearchingPolicies] = useState(false);
  const [assigningPolicyId, setAssigningPolicyId] = useState<string | null>(
    null
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase
        .from("online_payment_imports")
        .select(
          "id, fingerprint, payment_date, date_text, payment_time, description, amount_rial, payer, p1, p2, assigned_policy_id, status, transaction_id, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

      if (loadError) throw loadError;

      const importedRows = (data ?? []) as ImportRow[];
      setRows(importedRows);

      const assignedIds = Array.from(
        new Set(
          importedRows
            .map((row) => row.assigned_policy_id)
            .filter((value): value is string => Boolean(value))
        )
      );

      if (assignedIds.length === 0) {
        setPolicyLabels({});
        return;
      }

      const { data: policies, error: policyError } = await supabase
        .from("policies")
        .select("id, policy_number, customer_id")
        .in("id", assignedIds);

      if (policyError) throw policyError;

      const policyList = policies ?? [];
      const customerIds = Array.from(
        new Set(policyList.map((policy) => policy.customer_id))
      );

      const { data: customers, error: customerError } =
        customerIds.length > 0
          ? await supabase
              .from("customers")
              .select("id, full_name")
              .in("id", customerIds)
          : { data: [], error: null };

      if (customerError) throw customerError;

      const customerNames = new Map(
        (customers ?? []).map((customer) => [
          customer.id,
          customer.full_name,
        ])
      );

      const labels: Record<string, string> = {};

      for (const policy of policyList) {
        labels[policy.id] = `${policy.policy_number} — ${
          customerNames.get(policy.customer_id) || "بدون نام"
        }`;
      }

      setPolicyLabels(labels);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "دریافت اطلاعات واریزها ناموفق بود."
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function importExcel(file: File) {
    setError("");
    setNotice("");
    setImporting(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
      });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!firstSheet) {
        throw new Error("برگه‌ای در فایل اکسل پیدا نشد.");
      }

      const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        firstSheet,
        { defval: "", raw: false }
      );

      if (sheetRows.length === 0) {
        throw new Error("فایل اکسل ردیفی برای وارد کردن ندارد.");
      }

      const payload = [];

      for (let index = 0; index < sheetRows.length; index++) {
        const source = sheetRows[index];

        const dateText = getCell(source, ["تاریخ"]);
        const time = getCell(source, ["زمان"]);
        const description = getCell(source, ["شرح"]);
        const amountText = getCell(source, [
          "واریز (ریال)",
          "واریز(ریال)",
          "واریز",
        ]);
        const payer = getCell(source, ["پرداخت کننده", "پرداخت‌کننده"]);
        const p1 = getCell(source, ["پ ۱", "پ 1"]);
        const p2 = getCell(source, ["پ ۲", "پ 2"]);

        // Skip completely blank spreadsheet rows.
        if (
          !dateText &&
          !time &&
          !description &&
          !amountText &&
          !payer &&
          !p1 &&
          !p2
        ) {
          continue;
        }

        const amountRial = parseNumber(amountText);

        if (!dateText || !Number.isFinite(amountRial) || amountRial <= 0) {
          throw new Error(
            `اطلاعات تاریخ یا مبلغ ردیف ${money(index + 2)} نامعتبر است.`
          );
        }

        const paymentDate = parseJalaliTextToGregorianISO(dateText);

if (!paymentDate) {
  throw new Error(
    `تاریخ ردیف ${money(index + 2)} نامعتبر است: ${dateText}`
  );
}

        const fingerprint = await makeFingerprint([
          dateText,
          time,
          description,
          String(amountRial),
          payer,
          p1,
          p2,
        ]);

        payload.push({
          fingerprint,
          payment_date: paymentDate,
          date_text: dateText,
          payment_time: time,
          description,
          amount_rial: amountRial,
          payer,
          p1,
          p2,
        });
      }

      if (payload.length === 0) {
        throw new Error("هیچ ردیف معتبری برای وارد کردن پیدا نشد.");
      }

      const { error: insertError } = await supabase
        .from("online_payment_imports")
        .upsert(payload, {
          onConflict: "fingerprint",
          ignoreDuplicates: true,
        });

      if (insertError) throw insertError;

      await loadRows();

      setNotice(
        `${money(payload.length)} ردیف بررسی شد. ردیف‌های تکراری دوباره وارد نمی‌شوند.`
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "وارد کردن فایل اکسل ناموفق بود."
      );
    } finally {
      setImporting(false);
    }
  }

  async function searchPolicies() {
    const query = policySearch.trim();

    if (!query) {
      setPolicyResults([]);
      return;
    }

    setSearchingPolicies(true);
    setError("");

    try {
      const [
        { data: numberMatches, error: numberError },
        { data: customerMatches, error: customerError },
      ] = await Promise.all([
        supabase
          .from("policies")
          .select("id, policy_number, policy_type, total_price, customer_id")
          .ilike("policy_number", `%${query}%`)
          .limit(10),

        supabase
          .from("customers")
          .select("id, full_name, id_number")
          .or(`full_name.ilike.%${query}%,id_number.ilike.%${query}%`)
          .limit(10),
      ]);

      if (numberError) throw numberError;
      if (customerError) throw customerError;

      const matchingCustomers = customerMatches ?? [];
      const customerIds = matchingCustomers.map((customer) => customer.id);

      const { data: customerPolicies, error: linkedPolicyError } =
        customerIds.length > 0
          ? await supabase
              .from("policies")
              .select(
                "id, policy_number, policy_type, total_price, customer_id"
              )
              .in("customer_id", customerIds)
              .limit(20)
          : { data: [], error: null };

      if (linkedPolicyError) throw linkedPolicyError;

      const allPolicies = Array.from(
        new Map(
          [...(numberMatches ?? []), ...(customerPolicies ?? [])].map(
            (policy) => [policy.id, policy]
          )
        ).values()
      );

      const allCustomerIds = Array.from(
        new Set(allPolicies.map((policy) => policy.customer_id))
      );

      const { data: linkedCustomers, error: linkedCustomerError } =
        allCustomerIds.length > 0
          ? await supabase
              .from("customers")
              .select("id, full_name, id_number")
              .in("id", allCustomerIds)
          : { data: [], error: null };

      if (linkedCustomerError) throw linkedCustomerError;

      const customersById = new Map(
        (linkedCustomers ?? []).map((customer) => [
          customer.id,
          customer,
        ])
      );

      setPolicyResults(
        allPolicies.map((policy) => {
          const customer = customersById.get(policy.customer_id);

          return {
            ...policy,
            customer_name: customer?.full_name || "بدون نام",
            id_number: customer?.id_number || "",
          };
        })
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "جست‌وجوی بیمه‌نامه ناموفق بود."
      );
    } finally {
      setSearchingPolicies(false);
    }
  }

  async function assignPolicy(policy: PolicyOption) {
    if (!selectedRow) return;

    setAssigningPolicyId(policy.id);
    setError("");
    setNotice("");

    try {
      const { error: updateError } = await supabase
        .from("online_payment_imports")
        .update({
          assigned_policy_id: policy.id,
          status: "assigned",
        })
        .eq("id", selectedRow.id)
        .neq("status", "completed");

      if (updateError) throw updateError;

      setNotice("بیمه‌نامه به واریز تخصیص داده شد.");
      setSelectedRow(null);
      setPolicySearch("");
      setPolicyResults([]);

      await loadRows();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تخصیص بیمه‌نامه ناموفق بود."
      );
    } finally {
      setAssigningPolicyId(null);
    }
  }

  async function completePayment(row: ImportRow) {
    if (!row.assigned_policy_id || savingId) return;

    const confirmed = window.confirm(
      `مبلغ ${money(Number(row.amount_rial) / 10)} تومان به عنوان پرداخت بیمه‌نامه ${
        policyLabels[row.assigned_policy_id] || ""
      } ثبت شود؟`
    );

    if (!confirmed) return;

    setSavingId(row.id);
    setError("");
    setNotice("");


try {
  const { error: rpcError } = await supabase.rpc(
    "complete_online_payment_import",
    {
      p_import_id: row.id,
      p_policy_id: row.assigned_policy_id,
    }
  );

if (rpcError) {
  console.error("complete_online_payment_import failed:", rpcError);
  throw rpcError;
}

  setNotice("واریز با موفقیت ثبت و به حسابداری منتقل شد.");
  await loadRows();
} catch (cause) {

      setError(getErrorMessage(cause, "ثبت پرداخت ناموفق بود."));
    } finally {
      setSavingId(null);
    }
  }

  const visibleRows = rows.filter((row) => {
    const matchesStatus =
      filter === "all" || row.status === filter;

    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [
        row.date_text,
        row.payment_time,
        row.description,
        row.payer,
        row.p1,
        row.p2,
        policyLabels[row.assigned_policy_id || ""] || "",
      ].some((value) => String(value).toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  const completedCount = rows.filter(
    (row) => row.status === "completed"
  ).length;

  const assignedCount = rows.filter(
    (row) => row.status === "assigned"
  ).length;

  const unassignedCount = rows.filter(
    (row) => row.status === "unassigned"
  ).length;

  const totalImportedRial = rows.reduce(
    (sum, row) => sum + (Number(row.amount_rial) || 0),
    0
  );

  return (
    <AppShell>
      <main
        dir="rtl"
        className="min-h-screen bg-[#F6F7FC] p-4 text-slate-800 md:p-8"
      >
        <div className="mx-auto max-w-[1600px] space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold">
                تطبیق واریزهای بانکی
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                وارد کردن صورت‌حساب اکسل و تخصیص واریزها به بیمه‌نامه‌ها
              </p>
            </div>

            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#001427] px-5 py-3 text-sm font-bold text-white hover:bg-[#17354a]">
              {importing ? "در حال وارد کردن..." : "وارد کردن فایل اکسل"}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importExcel(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </header>

          {error && (
            <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {notice}
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">کل ردیف‌های ذخیره‌شده</p>
              <p className="mt-2 text-2xl font-extrabold">
                {money(rows.length)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">نیازمند تخصیص</p>
              <p className="mt-2 text-2xl font-extrabold text-amber-700">
                {money(unassignedCount)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">تخصیص‌یافته، ثبت‌نشده</p>
              <p className="mt-2 text-2xl font-extrabold text-sky-700">
                {money(assignedCount)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">تراکنش‌های ثبت‌شده</p>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">
                {money(completedCount)}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e7ece9] bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  جست‌وجو در ردیف‌ها
                </label>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="شرح، پرداخت‌کننده، تاریخ یا بیمه‌نامه"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  وضعیت ردیف
                </label>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                >
                  <option value="all">همه ردیف‌ها</option>
                  <option value="unassigned">نیازمند تخصیص</option>
                  <option value="assigned">تخصیص‌یافته</option>
                  <option value="completed">ثبت‌شده</option>
                </select>
              </div>

              <div className="flex items-end">
                <div className="w-full rounded-xl bg-[#f7f9f8] p-3">
                  <p className="text-xs text-slate-500">
                    مجموع واریزهای واردشده
                  </p>
                  <p className="mt-1 font-extrabold">
                    {money(totalImportedRial)} ریال
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    معادل {money(totalImportedRial / 10)} تومان
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#e7ece9] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ee] p-5">
              <h2 className="font-extrabold">صورت‌حساب بانکی</h2>
              <span className="text-xs text-slate-500">
                {money(visibleRows.length)} ردیف نمایش داده می‌شود
              </span>
            </div>

            {loading ? (
              <p className="p-10 text-center text-sm text-slate-500">
                در حال دریافت ردیف‌ها...
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1350px] text-right text-sm">
                  <thead className="bg-[#f7f9f8] text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-4">وضعیت</th>
                      <th className="px-4 py-4">تاریخ</th>
                      <th className="px-4 py-4">زمان</th>
                      <th className="px-4 py-4">شرح</th>
                      <th className="px-4 py-4">واریز (ریال)</th>
                      <th className="px-4 py-4">پرداخت‌کننده</th>
                      <th className="px-4 py-4">پ ۱</th>
                      <th className="px-4 py-4">پ ۲</th>
                      <th className="px-4 py-4">بیمه‌نامه تخصیص‌یافته</th>
                      <th className="px-4 py-4">عملیات</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#edf0ee]">
                    {visibleRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-4">
                          <span
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                              row.status === "completed"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.status === "assigned"
                                  ? "bg-sky-50 text-sky-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {row.status === "completed"
                              ? "ثبت‌شده"
                              : row.status === "assigned"
                                ? "تخصیص‌یافته"
                                : "تخصیص‌نیافته"}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          {row.date_text}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4" dir="ltr">
                          {row.payment_time || "—"}
                        </td>
                        <td className="max-w-xs whitespace-normal px-4 py-4">
                          {row.description || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-bold">
                          {money(Number(row.amount_rial) || 0)}
                        </td>
                        <td className="px-4 py-4">{row.payer || "—"}</td>
                        <td className="px-4 py-4">{row.p1 || "—"}</td>
                        <td className="px-4 py-4">{row.p2 || "—"}</td>
                        <td className="min-w-[220px] px-4 py-4">
                          {row.assigned_policy_id
                            ? policyLabels[row.assigned_policy_id] ||
                              "بیمه‌نامه تخصیص‌یافته"
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {row.status === "completed" ? (
                            <span className="text-xs font-bold text-emerald-700">
                              تراکنش ثبت شده
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRow(row);
                                  setPolicySearch("");
                                  setPolicyResults([]);
                                  setError("");
                                }}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-100"
                              >
                                {row.assigned_policy_id
                                  ? "تغییر تخصیص"
                                  : "تخصیص بیمه‌نامه"}
                              </button>

                              {row.status === "assigned" && (
                                <button
                                  type="button"
                                  disabled={savingId !== null}
                                  onClick={() => void completePayment(row)}
                                  className="rounded-lg bg-[#001427] px-3 py-2 text-xs font-bold text-white hover:bg-[#17354a] disabled:opacity-50"
                                >
                                  {savingId === row.id
                                    ? "در حال ثبت..."
                                    : "ثبت پرداخت"}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {visibleRows.length === 0 && (
                  <p className="p-10 text-center text-sm text-slate-500">
                    ردیفی برای نمایش وجود ندارد. ابتدا فایل اکسل صورت‌حساب بانکی
                    را وارد کنید.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {selectedRow && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedRow(null);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="assign-policy-title"
              className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl md:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="assign-policy-title"
                    className="text-lg font-extrabold"
                  >
                    تخصیص واریز به بیمه‌نامه
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    با شماره بیمه‌نامه، نام مشتری یا کد ملی جست‌وجو کنید.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  بستن
                </button>
              </div>

              <div className="mt-5 rounded-xl bg-[#f7f9f8] p-4 text-sm">
                <p>
                  <span className="text-slate-500">پرداخت‌کننده: </span>
                  <span className="font-bold">
                    {selectedRow.payer || "—"}
                  </span>
                </p>
                <p className="mt-2">
                  <span className="text-slate-500">تاریخ: </span>
                  {selectedRow.date_text}
                </p>
                <p className="mt-2">
                  <span className="text-slate-500">مبلغ واریز: </span>
                  <span className="font-extrabold">
                    {money(Number(selectedRow.amount_rial) / 10)} تومان
                  </span>
                </p>
              </div>

              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchPolicies();
                }}
              >
                <input
                  autoFocus
                  value={policySearch}
                  onChange={(event) => setPolicySearch(event.target.value)}
                  placeholder="شماره بیمه‌نامه یا نام مشتری..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#708d81]"
                />
                <button
                  type="submit"
                  disabled={searchingPolicies}
                  className="rounded-xl bg-[#001427] px-5 py-3 text-sm font-bold text-white hover:bg-[#17354a] disabled:opacity-50"
                >
                  {searchingPolicies ? "در حال جست‌وجو..." : "جست‌وجو"}
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {policyResults.map((policy) => (
                  <div
                    key={policy.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                  >
                    <div>
                      <p className="font-extrabold">
                        {policy.policy_number}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {policy.customer_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {policy.policy_type} · کد ملی:{" "}
                        {policy.id_number || "—"}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={assigningPolicyId !== null}
                      onClick={() => void assignPolicy(policy)}
                      className="rounded-lg border border-[#708d81] px-4 py-2 text-sm font-bold text-[#40594f] hover:bg-[#708d81]/10 disabled:opacity-50"
                    >
                      {assigningPolicyId === policy.id
                        ? "در حال ذخیره..."
                        : "انتخاب بیمه‌نامه"}
                    </button>
                  </div>
                ))}

                {!searchingPolicies &&
                  policySearch.trim() &&
                  policyResults.length === 0 && (
                    <p className="py-6 text-center text-sm text-slate-500">
                      بیمه‌نامه‌ای با این مشخصات پیدا نشد.
                    </p>
                  )}
              </div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
