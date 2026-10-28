"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import AppShell from "../components/AppShell";

type Customer = {
  full_name: string;
  id_number: string;
  mobile: string;
  address: string;
};

type ColumnKey = keyof Customer;

type IconName =
  | "plus"
  | "search"
  | "download"
  | "upload"
  | "file"
  | "users"
  | "close"
  | "export"
  | "user";

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  full_name: ["نام و نام خانوادگی", "نام کامل", "نام مشتری", "نام"],
  id_number: ["کد ملی", "شماره ملی", "کدملی"],
  mobile: ["شماره موبایل", "موبایل", "شماره تماس", "تلفن همراه"],
  address: ["آدرس", "نشانی"],
};

function Icon({
  name,
  size = 20,
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
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </svg>
      );

    case "download":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5M12 15V3" />
        </svg>
      );

    case "upload":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5M12 3v12" />
        </svg>
      );

    case "file":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M8 13h8M8 17h8" />
        </svg>
      );

    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
          <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );

    case "close":
      return (
        <svg {...common}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      );

    case "export":
      return (
        <svg {...common}>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
          <path d="M5 17v3h14v-3" />
        </svg>
      );

    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      );
  }
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[۰-۹]/g, (digit) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    )
    .replace(/[٠-٩]/g, (digit) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    );
}

function resolveColumnIndexes(headers: string[]) {
  const indexes: Record<ColumnKey, number> = {
    full_name: -1,
    id_number: -1,
    mobile: -1,
    address: -1,
  };

  headers.forEach((rawHeader, index) => {
    const header = rawHeader.trim();

    (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
      if (
        indexes[key] === -1 &&
        HEADER_ALIASES[key].includes(header)
      ) {
        indexes[key] = index;
      }
    });
  });

  return indexes;
}

function makeWorkbookSheet(customers: Customer[]) {
  const rows = customers.map((customer) => ({
    "نام و نام خانوادگی": customer.full_name,
    "کد ملی": `="${customer.id_number}"`,
    "شماره موبایل": `="${customer.mobile}"`,
    آدرس: customer.address,
  }));

  return XLSX.utils.json_to_sheet(rows, {
    header: [
      "نام و نام خانوادگی",
      "کد ملی",
      "شماره موبایل",
      "آدرس",
    ],
  });
}

function downloadWorkbook(
  customers: Customer[],
  filename: string,
  sheetName = "مشتریان"
) {
  const workbook = XLSX.utils.book_new();
  const worksheet = makeWorkbookSheet(customers);

  worksheet["!cols"] = [
    { wch: 26 },
    { wch: 18 },
    { wch: 20 },
    { wch: 42 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export default function CustomersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState("");

  const [pendingCustomers, setPendingCustomers] = useState<Customer[]>([]);
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Load customers from Supabase when the page opens.
  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      const { data, error } = await supabase
        .from("customers")
        .select("full_name, id_number, mobile, address")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setFormError(`بارگذاری مشتریان ناموفق بود: ${error.message}`);
        return;
      }

      setCustomers(
        (data ?? []).map((customer) => ({
          full_name: customer.full_name ?? "",
          id_number: normalize(customer.id_number),
          mobile: customer.mobile ?? "",
          address: customer.address ?? "",
        }))
      );
    }

    void loadCustomers();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Filter the entire customer list, not just the current page.
  const filteredCustomers = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return customers;

    return customers.filter((customer) =>
      [
        customer.full_name,
        customer.id_number,
        customer.mobile,
        customer.address,
      ].some((value) => value.toLowerCase().includes(search))
    );
  }, [customers, query]);

  // Pagination is applied after filtering.
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / pageSize)
  );

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;

    return filteredCustomers.slice(startIndex, startIndex + pageSize);
  }, [filteredCustomers, currentPage]);

  const startItem =
    filteredCustomers.length === 0
      ? 0
      : (currentPage - 1) * pageSize + 1;

  const endItem = Math.min(
    currentPage * pageSize,
    filteredCustomers.length
  );

  // Start from the first page whenever the search changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  // Keep the current page valid if customers are added or removed.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function downloadTemplate() {
    const sample: Customer[] = [
      {
        full_name: "علی رضایی",
        id_number: "0012345678",
        mobile: "09121234567",
        address: "تهران، خیابان ولیعصر",
      },
    ];

    downloadWorkbook(sample, "قالب-بارگذاری-مشتریان.xlsx");
  }

  function exportCustomers() {
    downloadWorkbook(customers, "فهرست-مشتریان.xlsx");
  }

  function resetImport() {
    setPendingCustomers([]);
    setFileName("");
    setImportError("");
    setImportMessage("");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setFileName(file.name);
    setPendingCustomers([]);
    setImportError("");
    setImportMessage("");

    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      try {
        const buffer = loadEvent.target?.result;

        if (!buffer) {
          throw new Error("فایل خوانده نشد.");
        }

        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!firstSheet) {
          throw new Error("برگه‌ای در فایل پیدا نشد.");
        }

        const rows = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          raw: false,
          defval: "",
        }) as unknown[][];

        if (rows.length < 2) {
          throw new Error(
            "فایل خالی است یا اطلاعاتی برای وارد کردن ندارد."
          );
        }

        const headers = (rows[0] ?? []).map((cell) =>
          String(cell ?? "").trim()
        );

        const indexes = resolveColumnIndexes(headers);

        if (indexes.full_name === -1 || indexes.id_number === -1) {
          throw new Error(
            "ستون‌های «نام و نام خانوادگی» و «کد ملی» الزامی هستند. لطفاً از قالب نمونه استفاده کنید."
          );
        }

        const parsed: Customer[] = [];

        for (const row of rows.slice(1)) {
          const customer: Customer = {
            full_name: normalize(row[indexes.full_name]),
            id_number: normalize(row[indexes.id_number]),
            mobile:
              indexes.mobile >= 0
                ? normalize(row[indexes.mobile])
                : "",
            address:
              indexes.address >= 0
                ? String(row[indexes.address] ?? "").trim()
                : "",
          };

          if (!customer.full_name && !customer.id_number) continue;

          parsed.push(customer);
        }

        if (parsed.length === 0) {
          throw new Error(
            "هیچ ردیف دارای اطلاعاتی در فایل پیدا نشد."
          );
        }

        setPendingCustomers(parsed);
      } catch (error) {
        setImportError(
          error instanceof Error
            ? error.message
            : "خواندن فایل اکسل ناموفق بود."
        );
      }
    };

    reader.onerror = () => {
      setImportError("خواندن فایل با خطا مواجه شد.");
    };

    reader.readAsArrayBuffer(file);
  }

  async function confirmImport() {
    if (importing) return;

    setImportError("");
    setImportMessage("");

    const invalidRows = pendingCustomers.filter(
      (customer) => !customer.full_name || !customer.id_number
    );

    if (invalidRows.length > 0) {
      setImportError(
        `${invalidRows.length} ردیف فاقد نام یا کد ملی است. فایل را اصلاح کنید.`
      );
      return;
    }

    const invalidNationalIds = pendingCustomers.filter(
      (customer) => !/^\d{10}$/.test(customer.id_number)
    );

    if (invalidNationalIds.length > 0) {
      setImportError(
        `${invalidNationalIds.length} ردیف کد ملی نامعتبر دارد. کد ملی باید ۱۰ رقم باشد.`
      );
      return;
    }

    const seen = new Set<string>();
    const duplicateInFile = new Set<string>();

    for (const customer of pendingCustomers) {
      if (seen.has(customer.id_number)) {
        duplicateInFile.add(customer.id_number);
      }

      seen.add(customer.id_number);
    }

    if (duplicateInFile.size > 0) {
      setImportError(
        `کد ملی تکراری در فایل پیدا شد: ${Array.from(
          duplicateInFile
        ).join("، ")}`
      );
      return;
    }

    setImporting(true);

    try {
      const existingIds = new Set(
        customers.map((customer) => customer.id_number)
      );

      const newCustomers = pendingCustomers.filter(
        (customer) => !existingIds.has(customer.id_number)
      );

      if (newCustomers.length === 0) {
        setImportError(
          "همه مشتریان فایل از قبل در این فهرست وجود دارند."
        );
        return;
      }

      // The database generates each customer's UUID.
      // The unique id_number constraint prevents duplicate national IDs.
      // ignoreDuplicates also handles records added by another session.
      const { data, error } = await supabase
        .from("customers")
        .upsert(newCustomers, {
          onConflict: "id_number",
          ignoreDuplicates: true,
        })
        .select("full_name, id_number, mobile, address");

      if (error) {
        setImportError(
          `ذخیره اطلاعات در پایگاه داده ناموفق بود: ${error.message}`
        );
        return;
      }

      const insertedCustomers: Customer[] = (data ?? []).map(
        (customer) => ({
          full_name: customer.full_name ?? "",
          id_number: normalize(customer.id_number),
          mobile: customer.mobile ?? "",
          address: customer.address ?? "",
        })
      );

      setCustomers((previous) => {
        const combined = new Map(
          previous.map((customer) => [customer.id_number, customer])
        );

        insertedCustomers.forEach((customer) => {
          combined.set(customer.id_number, customer);
        });

        return Array.from(combined.values());
      });

      const skipped = pendingCustomers.length - insertedCustomers.length;

      setPendingCustomers([]);
      setFileName("");
      setImportMessage(
        `${insertedCustomers.length} مشتری در پایگاه داده ثبت شد.${
          skipped > 0
            ? ` ${skipped} مشتری تکراری نادیده گرفته شد.`
            : ""
        }`
      );
    } catch {
      setImportError("هنگام ذخیره مشتریان خطایی رخ داد.");
    } finally {
      setImporting(false);
    }
  }

  function handleEditCustomer(customer: Customer) {
    setEditingId(customer.id_number);
    setFullName(customer.full_name);
    setIdNumber(customer.id_number);
    setMobile(customer.mobile);
    setAddress(customer.address);
    setFormError("");
    setShowAddForm(true);
  }

  async function handleAddCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingCustomer) return;

    setFormError("");

    const customer: Customer = {
      full_name: fullName.trim(),
      id_number: normalize(idNumber),
      mobile: normalize(mobile),
      address: address.trim(),
    };

    if (!customer.full_name || !customer.id_number) {
      setFormError("نام و نام خانوادگی و کد ملی الزامی هستند.");
      return;
    }

    if (!/^\d{10}$/.test(customer.id_number)) {
      setFormError("کد ملی باید ۱۰ رقم باشد.");
      return;
    }

    const duplicate = customers.some(
      (item) =>
        item.id_number === customer.id_number &&
        item.id_number !== editingId
    );

    if (duplicate) {
      setFormError("مشتری‌ای با این کد ملی قبلاً ثبت شده است.");
      return;
    }

    setSavingCustomer(true);

    try {
      if (editingId !== null) {
        // Update the existing database record using its original national ID.
        const { data, error } = await supabase
          .from("customers")
          .update({
            full_name: customer.full_name,
            id_number: customer.id_number,
            mobile: customer.mobile,
            address: customer.address,
          })
          .eq("id_number", editingId)
          .select("full_name, id_number, mobile, address")
          .maybeSingle();

        if (error) {
          if (error.code === "23505") {
            setFormError(
              "مشتری‌ای با این کد ملی قبلاً ثبت شده است."
            );
          } else {
            setFormError(
              `ویرایش مشتری ناموفق بود: ${error.message}`
            );
          }

          return;
        }

        if (!data) {
          setFormError(
            "رکورد مشتری پیدا نشد یا اجازه ویرایش آن را ندارید."
          );
          return;
        }

        const updatedCustomer: Customer = {
          full_name: data.full_name ?? "",
          id_number: normalize(data.id_number),
          mobile: data.mobile ?? "",
          address: data.address ?? "",
        };

        setCustomers((previous) =>
          previous.map((item) =>
            item.id_number === editingId ? updatedCustomer : item
          )
        );
      } else {
        // Insert the customer into Supabase; PostgreSQL generates the UUID.
        const { data, error } = await supabase
          .from("customers")
          .insert(customer)
          .select("full_name, id_number, mobile, address")
          .single();

        if (error) {
          if (error.code === "23505") {
            setFormError(
              "مشتری‌ای با این کد ملی قبلاً ثبت شده است."
            );
          } else {
            setFormError(
              `ثبت مشتری ناموفق بود: ${error.message}`
            );
          }

          return;
        }

        const savedCustomer: Customer = {
          full_name: data.full_name ?? "",
          id_number: normalize(data.id_number),
          mobile: data.mobile ?? "",
          address: data.address ?? "",
        };

        setCustomers((previous) => [
          savedCustomer,
          ...previous.filter(
            (item) => item.id_number !== savedCustomer.id_number
          ),
        ]);
      }

      setFullName("");
      setIdNumber("");
      setMobile("");
      setAddress("");
      setEditingId(null);
      setShowAddForm(false);
    } catch {
      setFormError("هنگام ارتباط با پایگاه داده خطایی رخ داد.");
    } finally {
      setSavingCustomer(false);
    }
  }

  return (
    <AppShell>
      <div
        dir="rtl"
        className="min-h-screen bg-[#F6F7FC] text-slate-800"
      >
        <header className="sticky top-0 z-10 flex h-[88px] items-center justify-between gap-3 border-b border-slate-100 bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 md:hidden">
              <span className="text-xl font-black">ب</span>
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-slate-900 sm:text-xl">
                مشتریان
              </h2>
              <p className="mt-1 hidden text-xs text-slate-400 sm:block">
                مدیریت اطلاعات و فهرست مشتریان
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setFormError("");
              setEditingId(null);
              setFullName("");
              setIdNumber("");
              setMobile("");
              setAddress("");
              setShowAddForm(true);
            }}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200/60 transition hover:-translate-y-0.5 hover:shadow-indigo-300 sm:px-5"
          >
            <Icon name="plus" size={18} />
            <span>افزودن مشتری</span>
          </button>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7 lg:p-10">
          {/* Excel actions */}
          <section className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h3 className="font-black text-slate-900">
                مدیریت فایل اکسل
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                مشتریان را به‌صورت تکی یا گروهی به فهرست اضافه کنید.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportCustomers}
                className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Icon name="export" size={18} />
                خروجی اکسل
              </button>

              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
              >
                <Icon name="download" size={18} />
                دانلود فایل نمونه
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700 transition hover:bg-orange-100"
              >
                <Icon name="upload" size={18} />
                ورود گروهی از اکسل
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {fileName && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Icon name="file" size={18} />
                  <span className="break-all">{fileName}</span>
                  <span className="text-slate-400">
                    ({pendingCustomers.length.toLocaleString("fa-IR")} ردیف)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={resetImport}
                  className="text-sm font-bold text-slate-500 hover:text-red-600"
                >
                  لغو فایل
                </button>
              </div>
            )}

            {importError && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700"
              >
                {importError}
              </p>
            )}

            {importMessage && (
              <p
                role="status"
                className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-700"
              >
                {importMessage}
              </p>
            )}

            {pendingCustomers.length > 0 && (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-bold text-slate-800">
                    پیش‌نمایش اطلاعات فایل
                  </h4>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={confirmImport}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {importing
                      ? "در حال افزودن..."
                      : `تأیید و افزودن ${pendingCustomers.length.toLocaleString("fa-IR")} مشتری`}
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-[650px] border-collapse text-right text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="p-3 font-semibold">
                          نام و نام خانوادگی
                        </th>
                        <th className="p-3 font-semibold">کد ملی</th>
                        <th className="p-3 font-semibold">شماره موبایل</th>
                        <th className="p-3 font-semibold">آدرس</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pendingCustomers.slice(0, 10).map((customer, index) => (
                        <tr
                          key={`${customer.id_number}-${index}`}
                          className="border-t border-slate-100"
                        >
                          <td className="p-3">
                            {customer.full_name || "—"}
                          </td>
                          <td className="p-3">
                            {customer.id_number || "—"}
                          </td>
                          <td className="p-3">
                            {customer.mobile || "—"}
                          </td>
                          <td className="max-w-[240px] truncate p-3">
                            {customer.address || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pendingCustomers.length > 10 && (
                  <p className="mt-2 text-xs text-slate-400">
                    نمایش ۱۰ ردیف اول از{" "}
                    {pendingCustomers.length.toLocaleString("fa-IR")} ردیف.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Customer list */}
          <section className="overflow-hidden rounded-[26px] border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h3 className="font-black text-slate-900">
                  فهرست مشتریان
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  اطلاعات مشتریان ثبت‌شده در این صفحه
                </p>
              </div>

              <div className="relative w-full sm:max-w-xs">
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Icon name="search" size={19} />
                </span>

                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="جست‌وجوی نام، کد ملی یا موبایل..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                />
              </div>
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-5 py-12 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-indigo-50 text-indigo-300">
                  <Icon name="users" size={36} />
                </div>

                <h4 className="font-bold text-slate-700">
                  {query
                    ? "مشتری‌ای با این مشخصات پیدا نشد"
                    : "هنوز مشتری‌ای ثبت نشده است"}
                </h4>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  {query
                    ? "عبارت جست‌وجو را تغییر دهید و دوباره تلاش کنید."
                    : "می‌توانید مشتری جدیدی اضافه کنید یا اطلاعات چند مشتری را از طریق فایل اکسل وارد کنید."}
                </p>

                {!query && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFullName("");
                      setIdNumber("");
                      setMobile("");
                      setAddress("");
                      setFormError("");
                      setShowAddForm(true);
                    }}
                    className="mt-5 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
                  >
                    <Icon name="plus" size={18} />
                    افزودن اولین مشتری
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-4 font-semibold">ردیف</th>
                      <th className="p-4 font-semibold">
                        نام و نام خانوادگی
                      </th>
                      <th className="p-4 font-semibold">کد ملی</th>
                      <th className="p-4 font-semibold">شماره موبایل</th>
                      <th className="p-4 font-semibold">آدرس</th>
                      <th className="p-4 font-semibold">عملیات</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedCustomers.map((customer, index) => (
                      <tr
                        key={customer.id_number}
                        className="border-t border-slate-100 transition hover:bg-slate-50/70"
                      >
                        <td className="p-4 text-slate-400">
                          {(startItem + index).toLocaleString("fa-IR")}
                        </td>

                        <td className="p-4 font-bold text-slate-800">
                          {customer.full_name}
                        </td>

                        <td className="p-4 text-slate-600">
                          {customer.id_number}
                        </td>

                        <td className="p-4 text-slate-600">
                          {customer.mobile || "—"}
                        </td>

                        <td className="max-w-[260px] truncate p-4 text-slate-500">
                          {customer.address || "—"}
                        </td>

                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => handleEditCustomer(customer)}
                            className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
                          >
                            ویرایش
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredCustomers.length > 0 && (
              <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-slate-400">
                  نمایش {startItem.toLocaleString("fa-IR")} تا{" "}
                  {endItem.toLocaleString("fa-IR")} از{" "}
                  {filteredCustomers.length.toLocaleString("fa-IR")} مشتری
                </p>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      قبلی
                    </button>

                    <span className="px-2 text-sm text-slate-600">
                      صفحه {currentPage.toLocaleString("fa-IR")} از{" "}
                      {totalPages.toLocaleString("fa-IR")}
                    </span>

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(totalPages, page + 1)
                        )
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      بعدی
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Add customer modal */}
        {showAddForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowAddForm(false);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-customer-title"
              className="my-auto w-full max-w-lg rounded-[26px] bg-white p-5 shadow-2xl sm:p-7"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="add-customer-title"
                    className="text-lg font-black text-slate-900"
                  >
                    {editingId !== null
                      ? "ویرایش اطلاعات مشتری"
                      : "افزودن مشتری جدید"}
                  </h3>

                  <p className="mt-1 text-sm text-slate-400">
                    اطلاعات مشتری را وارد کنید.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  aria-label="بستن"
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Icon name="close" size={20} />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-4">
                <div>
                  <label
                    htmlFor="customer-name"
                    className="mb-2 block text-sm font-bold text-slate-700"
                  >
                    نام و نام خانوادگی{" "}
                    <span className="text-red-500">*</span>
                  </label>

                  <input
                    id="customer-name"
                    required
                    autoFocus
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder=""
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="customer-id"
                    className="mb-2 block text-sm font-bold text-slate-700"
                  >
                    کد ملی <span className="text-red-500">*</span>
                  </label>

                  <input
                    id="customer-id"
                    required
                    inputMode="numeric"
                    maxLength={10}
                    value={idNumber}
                    onChange={(event) => setIdNumber(event.target.value)}
                    placeholder=""
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="customer-mobile"
                    className="mb-2 block text-sm font-bold text-slate-700"
                  >
                    شماره موبایل
                  </label>

                  <input
                    id="customer-mobile"
                    inputMode="tel"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    placeholder=""
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="customer-address"
                    className="mb-2 block text-sm font-bold text-slate-700"
                  >
                    آدرس
                  </label>

                  <textarea
                    id="customer-address"
                    rows={3}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="آدرس مشتری (اختیاری)"
                    className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700"
                  >
                    {formError}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingCustomer}
                    className="flex-1 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:shadow-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingCustomer
                      ? "در حال ذخیره..."
                      : editingId !== null
                        ? "ذخیره تغییرات"
                        : "ثبت مشتری"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}