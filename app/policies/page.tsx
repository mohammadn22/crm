"use client";
import Link from "next/link";
import AppShell from "../components/AppShell";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import {
  isValidJalaaliDate,
  jalaaliMonthLength,
} from "jalaali-js";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import {
  parseAmount,
  parseJalaliTextToGregorianISO,
  readTextValue,
} from "@/lib/date-utils";

type PolicyType =
  | "شخص ثالث"
  | "بدنه"
  | "آتش‌سوزی"
  | "مسئولیت"
  | "باربری";

type Customer = {
  id: string;
  fullName: string;
  nationalId: string;
  phone: string;
  address: string;
};

type Installment = {
  amount: number;
  date: string;
  paid: boolean;
};

type Policy = {
  id: string;
  customerId: string;
  fullName: string;
  nationalId: string;
  phone: string;
  address: string;
  policyNumber: string;
  type: PolicyType;
  issueDate: string;
  startDate: string;
  endDate: string;
  amount: number;
  paymentType: "نقد" | "اقساطی";
  cashAmount: number;
  installmentCount: number;
  firstInstallmentDate: string;
  installments: Installment[];
  createdAt: string;
};

type CustomerRow = {
  id: string;
  full_name: string;
  id_number: string;
  mobile: string | null;
  address: string | null;
};

type PolicyRow = {
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
  created_at?: string;
};

type ScheduleRow = {
  id: string;
  policy_id: string;
  sequence_number: number;
  description: string;
  amount_due: number | string;
  due_date: string;
  paid: boolean;
};

type ImportResult = {
  policy_number: string;
  status: "imported" | "skipped" | "failed";
  reason?: string;
};

const policyTypes: PolicyType[] = [
  "شخص ثالث",
  "بدنه",
  "آتش‌سوزی",
  "مسئولیت",
  "باربری",
];

const emptyForm = {
  customerId: "",
  fullName: "",
  nationalId: "",
  phone: "",
  address: "",
  policyNumber: "",
  type: "شخص ثالث" as PolicyType,
  issueDate: "",
  startDate: "",
  endDate: "",
  amount: "",
  paymentType: "نقد" as "نقد" | "اقساطی",
  cashAmount: "",
  installmentCount: "3",
  firstInstallmentDate: "",
};

const IMPORT_POLICY_TYPE = "بیمه شخص ثالث خودرو";

const PAGE_SIZE = 10;

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);

  return pages;
}

function digits(value: string) {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function normalizeDate(value: string) {
  const normalized = digits(value.trim()).replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length !== 3) return normalized;

  const [year, month, day] = parts;
  return `${year.padStart(4, "0")}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

function validDate(value: string) {
  const parts = normalizeDate(value).split("/").map(Number);
  return (
    parts.length === 3 &&
    isValidJalaaliDate(parts[0], parts[1], parts[2])
  );
}

function addJalaliMonths(value: string, offset: number) {
  const normalized = normalizeDate(value);
  if (!validDate(normalized)) return "";

  const [year, month, day] = normalized.split("/").map(Number);
  const absoluteMonth = year * 12 + month - 1 + offset;
  const newYear = Math.floor(absoluteMonth / 12);
  const newMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  const newDay = Math.min(day, jalaaliMonthLength(newYear, newMonth));

  return `${newYear}/${String(newMonth).padStart(2, "0")}/${String(newDay).padStart(2, "0")}`;
}

function dateKey(value: string) {
  return normalizeDate(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function parseMoney(value: string) {
  const cleaned = digits(value).replace(/[,\s٬،]/g, "");
  return Math.max(0, Number(cleaned) || 0);
}

function makeInstallments(
  amount: number,
  cashAmount: number,
  count: number,
  firstDate: string,
): Installment[] {
  if (
    !count ||
    count < 1 ||
    !validDate(firstDate) ||
    cashAmount > amount
  ) {
    return [];
  }

  const remaining = amount - cashAmount;
  const baseAmount = Math.floor(remaining / count);

  return Array.from({ length: count }, (_, index) => ({
    amount:
      index === count - 1
        ? remaining - baseAmount * (count - 1)
        : baseAmount,
    date: addJalaliMonths(firstDate, index),
    paid: false,
  }));
}

function Icon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 9h18M16 14h2M6 5V3h12v2" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="m16 4 4 4L9 19l-5 1 1-5Z" />
        <path d="m14 6 4 4" />
      </>
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    filter: <path d="M4 5h16M7 12h10m-7 7h4" />,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}

type ScheduleImportRow = {
  amount: number;
  dueDateISO: string | null;
  displayDate: string;
};

type PolicyGroup = {
  excelRow: number;
  policyNumber: string;
  startDateISO: string | null;
  endDateISO: string | null;
  startDateDisplay: string;
  endDateDisplay: string;
  clientName: string;
  clientIdNumber: string;
  mobile: string;
  address: string;
  policyType: PolicyType | null;
  rawPolicyType: string;
  schedule: ScheduleImportRow[];
  errors: string[];
};

function downloadTemplate() {
  const headers = [
    "شماره بیمه نامه",
    "تاریخ شروع بیمه‌نامه",
    "تاریخ پایان بیمه‌نامه",
    "نام بیمه‌ گذار",
    "کد ملی بیمه گذار",
    "مبلغ پرداختی",
    "تاریخ",
    "شماره همراه",
    "آدرس",
    "نوع بیمه‌نامه",
  ];

  const rows = [
    [
      "1405/124/34631/0",
      "1405/01/01",
      "1406/01/01",
      "علی رضایی",
      "0123456789",
      "",
      "",
      "09121234567",
      "تهران",
      "شخص ثالث",
    ],
    ["", "", "", "", "", "2000000", "1403/02/01", "", "", ""],
    ["", "", "", "", "", "2000000", "1403/03/01", "", "", ""],
    ["", "", "", "", "", "2000000", "1403/04/01", "", "", ""],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = [
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 30 },
    { wch: 22 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ورود بیمه‌نامه‌ها");
  XLSX.writeFile(workbook, "policies-import-template.xlsx");
}

function policyTypeKey(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200e\u200f\s]/g, "");
}

function parsePolicyType(value: string): PolicyType | null {
  const key = policyTypeKey(value);
  if (!key) return null;
  if (key === "ثالث") return "شخص ثالث";
  return policyTypes.find((type) => policyTypeKey(type) === key) ?? null;
}

function groupRows(rows: unknown[][]): PolicyGroup[] {
  const groups: PolicyGroup[] = [];
  let current: PolicyGroup | null = null;

  const cell = (row: unknown[], index: number) =>
    readTextValue(row[index] ?? "");

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row.some((value) => readTextValue(value).trim())) continue;

    const policyNumber = digits(cell(row, 0)).trim();

    if (policyNumber) {
      const startDateDisplay = cell(row, 1).trim();
      const endDateDisplay = cell(row, 2).trim();

      current = {
        excelRow: index + 2,
        policyNumber,
        startDateISO: parseJalaliTextToGregorianISO(startDateDisplay),
        endDateISO: parseJalaliTextToGregorianISO(endDateDisplay),
        startDateDisplay: normalizeDate(startDateDisplay),
        endDateDisplay: normalizeDate(endDateDisplay),
        clientName: cell(row, 3).trim(),
        clientIdNumber: digits(cell(row, 4)).trim(),
        mobile: digits(cell(row, 7)).trim(),
        address: cell(row, 8).trim(),
        rawPolicyType: cell(row, 9).trim(),
        policyType: parsePolicyType(cell(row, 9)),
        schedule: [],
        errors: [],
      };

      groups.push(current);
    } else if (!current) {
      continue;
    }

    if (!current) continue;

    const amountText = cell(row, 5).trim();
    const dateText = cell(row, 6).trim();

    if (amountText || dateText) {
      const amount = Math.round((parseAmount(row[5]) ?? 0) / 10);
      const dueDateISO = parseJalaliTextToGregorianISO(dateText);

      current.schedule.push({
        amount,
        dueDateISO,
        displayDate: normalizeDate(dateText),
      });
    }
  }

  return groups;
}

function validateGroups(groups: PolicyGroup[]) {
  const seen = new Set<string>();

  for (const group of groups) {
    if (seen.has(group.policyNumber)) {
      group.errors.push("شماره بیمه‌نامه در فایل تکراری است.");
    }
    seen.add(group.policyNumber);

    if (!group.policyNumber) {
      group.errors.push("شماره بیمه‌نامه الزامی است.");
    }
    if (!group.clientName) {
      group.errors.push("نام بیمه‌گذار الزامی است.");
    }
    if (!group.clientIdNumber) {
      group.errors.push("کد ملی بیمه‌گذار الزامی است.");
    }
    if (!group.rawPolicyType) {
      group.errors.push("نوع بیمه‌نامه الزامی است.");
    } else if (!group.policyType) {
      group.errors.push(
        `نوع بیمه‌نامه «${group.rawPolicyType}» معتبر نیست. ` +
          `مقادیر مجاز: ${policyTypes.join("، ")}.`,
      );
    }
    if (!group.startDateISO) {
      group.errors.push("تاریخ شروع نامعتبر است.");
    }
    if (!group.endDateISO) {
      group.errors.push("تاریخ پایان نامعتبر است.");
    }
    if (
      group.startDateISO &&
      group.endDateISO &&
      group.endDateISO <= group.startDateISO
    ) {
      group.errors.push("تاریخ پایان باید بعد از تاریخ شروع باشد.");
    }
    if (group.schedule.length === 0) {
      group.errors.push("حداقل یک پرداخت برای بیمه‌نامه لازم است.");
    }

    for (const schedule of group.schedule) {
      if (schedule.amount <= 0) {
        group.errors.push("مبلغ پرداختی باید بیشتر از صفر باشد.");
      }
      if (!schedule.dueDateISO) {
        group.errors.push("تاریخ یکی از پرداخت‌ها نامعتبر است.");
      }
    }
  }
}

export default function PoliciesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "type" | "number">("recent");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const updateForm = (key: keyof typeof emptyForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const amount = parseMoney(form.amount);
  const cashAmount =
    form.paymentType === "نقد" ? amount : parseMoney(form.cashAmount);
  const installmentCount = Math.max(
    0,
    Math.floor(Number(digits(form.installmentCount)) || 0),
  );

  const previewInstallments = useMemo(
    () =>
      form.paymentType === "اقساطی"
        ? makeInstallments(
            amount,
            cashAmount,
            installmentCount,
            form.firstInstallmentDate,
          )
        : [],
    [
      form.paymentType,
      amount,
      cashAmount,
      installmentCount,
      form.firstInstallmentDate,
    ],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const [
        { data: customerRows, error: customersError },
        { data: policyRows, error: policiesError },
        { data: scheduleRows, error: scheduleError },
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
      ]);

      if (customersError) throw customersError;
      if (policiesError) throw policiesError;
      if (scheduleError) throw scheduleError;

      const typedCustomers = (customerRows ?? []) as CustomerRow[];
      const typedPolicies = (policyRows ?? []) as PolicyRow[];
      const typedSchedules = (scheduleRows ?? []) as ScheduleRow[];

      const mappedCustomers: Customer[] = typedCustomers.map((customer) => ({
        id: customer.id,
        fullName: customer.full_name,
        nationalId: customer.id_number,
        phone: customer.mobile ?? "",
        address: customer.address ?? "",
      }));

      const customersById = new Map(
        mappedCustomers.map((customer) => [customer.id, customer]),
      );

      const schedulesByPolicy = new Map<string, ScheduleRow[]>();

      for (const schedule of typedSchedules) {
        const existing = schedulesByPolicy.get(schedule.policy_id) ?? [];
        existing.push(schedule);
        schedulesByPolicy.set(schedule.policy_id, existing);
      }

      const mappedPolicies: Policy[] = typedPolicies.map((row) => {
        const customer = customersById.get(row.customer_id);
        const schedule = schedulesByPolicy.get(row.id) ?? [];

        const cashRow = schedule.find(
          (item) => item.description === "پرداخت نقدی",
        );

        const installmentRows = schedule.filter(
          (item) => item.description !== "پرداخت نقدی",
        );

        const paymentType =
          row.payment_type === "اقساطی" ? "اقساطی" : "نقد";

        const firstInstallment =
          installmentRows[0]?.due_date ??
          row.first_installment_date ??
          "";

        const type = policyTypes.includes(row.policy_type as PolicyType)
          ? (row.policy_type as PolicyType)
          : "شخص ثالث";

        return {
          id: row.id,
          customerId: row.customer_id,
          fullName: customer?.fullName ?? "مشتری نامشخص",
          nationalId: customer?.nationalId ?? "",
          phone: customer?.phone ?? "",
          address: customer?.address ?? "",
          policyNumber: row.policy_number,
          type,
          issueDate: normalizeDate(row.issue_date ?? ""),
          startDate: normalizeDate(row.start_date ?? ""),
          endDate: normalizeDate(row.end_date ?? ""),
          amount: Number(row.total_price) || 0,
          paymentType,
          cashAmount:
            Number(row.cash_amount) ||
            Number(cashRow?.amount_due) ||
            (paymentType === "نقد" ? Number(row.total_price) || 0 : 0),
          installmentCount:
            Number(row.installment_count) || installmentRows.length,
          firstInstallmentDate: normalizeDate(firstInstallment),
          installments: installmentRows.map((item) => ({
            amount: Number(item.amount_due) || 0,
            date: normalizeDate(item.due_date ?? ""),
            paid: Boolean(item.paid),
          })),
          createdAt: row.created_at ?? "",
        };
      });

      setCustomers(mappedCustomers);
      setPolicies(mappedPolicies);
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "دریافت اطلاعات از پایگاه داده ناموفق بود.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredPolicies = useMemo(() => {
    const search = digits(query.trim()).toLowerCase();

    return policies
      .filter((policy) => {
        const matchesSearch =
          !search ||
          digits(policy.fullName).toLowerCase().includes(search) ||
          digits(policy.nationalId).includes(search) ||
          digits(policy.policyNumber).includes(search);

        const policyDate = dateKey(policy.issueDate);
        const start = fromDate ? dateKey(fromDate) : "";
        const end = toDate ? dateKey(toDate) : "";

        return (
          matchesSearch &&
          (!start || policyDate >= start) &&
          (!end || policyDate <= end)
        );
      })
      .sort((a, b) => {
        let comparison: number;

        if (sortBy === "recent") {
          // Newest registered first (with "desc"); issue date breaks ties.
          comparison =
            a.createdAt.localeCompare(b.createdAt) ||
            dateKey(a.issueDate).localeCompare(dateKey(b.issueDate));
        } else if (sortBy === "type") {
          comparison = a.type.localeCompare(b.type, "fa");
        } else {
          comparison = a.policyNumber.localeCompare(b.policyNumber, "fa", {
            numeric: true,
          });
        }

        return sortOrder === "asc" ? comparison : -comparison;
      });
  }, [policies, query, sortBy, sortOrder, fromDate, toDate]);

  // Pagination. The page resets to 1 whenever a filter or sort changes
  // (the stored page is tied to the filter key it was chosen under).
  const filterKey = [query, sortBy, sortOrder, fromDate, toDate].join("|");
  const [pageState, setPageState] = useState({ key: "", page: 1 });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPolicies.length / PAGE_SIZE),
  );
  const currentPage = Math.min(
    pageState.key === filterKey ? pageState.page : 1,
    totalPages,
  );
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const paginatedPolicies = useMemo(
    () => filteredPolicies.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredPolicies, pageStart],
  );

  function goToPage(page: number) {
    setPageState({
      key: filterKey,
      page: Math.min(Math.max(1, page), totalPages),
    });
  }

  function openNewPolicy() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setCustomerSearch("");
    setShowNewCustomer(false);
    setError("");
    setPanelOpen(true);
  }

  function openEditPolicy(policy: Policy) {
    setEditingId(policy.id);
    setForm({
      customerId: policy.customerId,
      fullName: policy.fullName,
      nationalId: policy.nationalId,
      phone: policy.phone,
      address: policy.address,
      policyNumber: policy.policyNumber,
      type: policy.type,
      issueDate: policy.issueDate,
      startDate: policy.startDate,
      endDate: policy.endDate,
      amount: String(policy.amount),
      paymentType: policy.paymentType,
      cashAmount: String(policy.cashAmount),
      installmentCount: String(policy.installmentCount || 3),
      firstInstallmentDate: policy.firstInstallmentDate,
    });
    setCustomerSearch(policy.fullName);
    setShowNewCustomer(false);
    setError("");
    setPanelOpen(true);
  }

  function selectCustomer(customer: Customer) {
    setForm((previous) => ({
      ...previous,
      customerId: customer.id,
      fullName: customer.fullName,
      nationalId: customer.nationalId,
      phone: customer.phone,
      address: customer.address,
    }));
    setCustomerSearch(customer.fullName);
    setShowNewCustomer(false);
    setError("");
  }

  async function addCustomerInPlace() {
    setError("");

    const fullName = form.fullName.trim();
    const nationalId = digits(form.nationalId).trim();

    if (!fullName || !nationalId) {
      setError("نام و کد ملی بیمه‌گذار را وارد کنید.");
      return;
    }

    const existing = customers.find(
      (customer) => digits(customer.nationalId) === nationalId,
    );

    if (existing) {
      selectCustomer(existing);
      setError("مشتری با این کد ملی وجود دارد و انتخاب شد.");
      return;
    }

    setSaving(true);

    try {
      const { data, error: customerError } = await supabase
        .from("customers")
        .upsert(
          {
            full_name: fullName,
            id_number: nationalId,
            mobile: digits(form.phone),
            address: form.address.trim(),
          },
          { onConflict: "id_number" },
        )
        .select("id, full_name, id_number, mobile, address")
        .single();

      if (customerError) throw customerError;

      const customer: Customer = {
        id: data.id,
        fullName: data.full_name,
        nationalId: data.id_number,
        phone: data.mobile ?? "",
        address: data.address ?? "",
      };

      setCustomers((previous) => [
        ...previous.filter((item) => item.id !== customer.id),
        customer,
      ]);

      setForm((previous) => ({
        ...previous,
        customerId: customer.id,
        fullName: customer.fullName,
        nationalId: customer.nationalId,
        phone: customer.phone,
        address: customer.address,
      }));

      setCustomerSearch(customer.fullName);
      setShowNewCustomer(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "ثبت مشتری با خطا مواجه شد.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const policyNumber = digits(form.policyNumber).trim();
    const nationalId = digits(form.nationalId).trim();
    const policyAmount = parseMoney(form.amount);
    const fullName = form.fullName.trim();

    if (!fullName || !nationalId) {
      setError("نام و نام خانوادگی و شماره ملی بیمه‌گذار الزامی است.");
      return;
    }

    if (!policyNumber) {
      setError("شماره بیمه‌نامه را وارد کنید.");
      return;
    }

    if (
      policies.some(
        (policy) =>
          policy.policyNumber === policyNumber && policy.id !== editingId,
      )
    ) {
      setError("این شماره بیمه‌نامه قبلاً ثبت شده است.");
      return;
    }

    if (
      !validDate(form.issueDate) ||
      !validDate(form.startDate) ||
      !validDate(form.endDate)
    ) {
      setError(
        "تاریخ صدور، شروع و پایان را به‌صورت شمسی معتبر وارد کنید؛ مانند ۱۴۰۵/۰۷/۰۳.",
      );
      return;
    }

    if (dateKey(form.endDate) < dateKey(form.startDate)) {
      setError("تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.");
      return;
    }

    if (policyAmount <= 0) {
      setError("مبلغ بیمه‌نامه باید بیشتر از صفر باشد.");
      return;
    }

    if (form.paymentType === "اقساطی") {
      if (cashAmount > policyAmount) {
        setError("مبلغ بخش نقدی نمی‌تواند از مبلغ کل بیشتر باشد.");
        return;
      }

      if (installmentCount < 1 || installmentCount > 120) {
        setError("تعداد اقساط باید بین ۱ تا ۱۲۰ باشد.");
        return;
      }

      if (!validDate(form.firstInstallmentDate)) {
        setError("تاریخ قسط اول را به‌صورت شمسی معتبر وارد کنید.");
        return;
      }

      if (cashAmount === policyAmount) {
        setError("برای بیمه‌نامه اقساطی، مبلغ اقساط باید بیشتر از صفر باشد.");
        return;
      }
    }

    const finalCashAmount =
      form.paymentType === "نقد" ? policyAmount : cashAmount;

    const installments =
      form.paymentType === "اقساطی"
        ? makeInstallments(
            policyAmount,
            finalCashAmount,
            installmentCount,
            normalizeDate(form.firstInstallmentDate),
          )
        : [];

    if (
      form.paymentType === "اقساطی" &&
      installments.length !== installmentCount
    ) {
      setError("برنامه اقساط معتبر نیست. تاریخ قسط اول را بررسی کنید.");
      return;
    }

    setSaving(true);

    try {
      const previousPolicy = editingId
        ? policies.find((item) => item.id === editingId)
        : undefined;

      const newInstallmentCount =
        form.paymentType === "اقساطی" ? installmentCount : 0;
      const newFirstInstallment =
        form.paymentType === "اقساطی"
          ? normalizeDate(form.firstInstallmentDate)
          : "";

      // Everything that feeds the payment schedule.
      const scheduleChanged =
        !previousPolicy ||
        previousPolicy.amount !== policyAmount ||
        previousPolicy.paymentType !== form.paymentType ||
        previousPolicy.cashAmount !== finalCashAmount ||
        previousPolicy.installmentCount !== newInstallmentCount ||
        previousPolicy.firstInstallmentDate !== newFirstInstallment ||
        previousPolicy.issueDate !== normalizeDate(form.issueDate);

      // transaction_allocations reference payment_schedule rows, so the
      // schedule cannot be rebuilt once payments exist. Stop BEFORE anything
      // is written, otherwise the policy row would be updated and the
      // schedule left unchanged.
      if (editingId && scheduleChanged) {
        const { count, error: countError } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("policy_id", editingId);

        if (countError) throw countError;

        if ((count ?? 0) > 0) {
          setError(
            "برای این بیمه‌نامه تراکنش ثبت شده است؛ مبلغ، نحوه پرداخت، اقساط و تاریخ صدور آن قابل تغییر نیست. سایر اطلاعات را می‌توانید ویرایش کنید.",
          );
          return;
        }
      }

      let customerId = form.customerId;

      const customerPayload = {
        full_name: fullName,
        id_number: nationalId,
        mobile: digits(form.phone),
        address: form.address.trim(),
      };

      if (customerId) {
        const { data, error: updateCustomerError } = await supabase
          .from("customers")
          .update(customerPayload)
          .eq("id", customerId)
          .select("id")
          .maybeSingle();

        if (updateCustomerError) throw updateCustomerError;

        if (!data) {
          customerId = "";
        }
      }

      if (!customerId) {
        const { data, error: customerError } = await supabase
          .from("customers")
          .upsert(customerPayload, { onConflict: "id_number" })
          .select("id")
          .single();

        if (customerError) throw customerError;
        customerId = data.id;
      }

      const policyPayload = {
        customer_id: customerId,
        policy_number: policyNumber,
        policy_type: form.type,
        issue_date: normalizeDate(form.issueDate),
        start_date: normalizeDate(form.startDate),
        end_date: normalizeDate(form.endDate),
        total_price: policyAmount,
        payment_type: form.paymentType,
        cash_amount: finalCashAmount,
        installment_count:
          form.paymentType === "اقساطی" ? installmentCount : 0,
        first_installment_date:
          form.paymentType === "اقساطی"
            ? normalizeDate(form.firstInstallmentDate)
            : "",
      };

      let savedPolicyId = editingId;

      if (editingId) {
        const { data, error: updatePolicyError } = await supabase
          .from("policies")
          .update(policyPayload)
          .eq("id", editingId)
          .select("id")
          .single();

        if (updatePolicyError) throw updatePolicyError;
        savedPolicyId = data.id;
      } else {
        const { data, error: insertPolicyError } = await supabase
          .from("policies")
          .insert(policyPayload)
          .select("id")
          .single();

        if (insertPolicyError) throw insertPolicyError;
        savedPolicyId = data.id;
      }

      if (!savedPolicyId) {
        throw new Error("شناسه بیمه‌نامه ذخیره‌شده دریافت نشد.");
      }

      if (!editingId || scheduleChanged) {
      // Preserve paid installments when editing if their amount and date match.
      const oldPolicy = editingId
        ? policies.find((item) => item.id === editingId)
        : undefined;

      const oldPaid = new Set(
        (oldPolicy?.installments ?? [])
          .filter((item) => item.paid)
          .map((item) => `${item.amount}|${normalizeDate(item.date)}`),
      );

      const schedulePayload: {
        policy_id: string;
        sequence_number: number;
        description: string;
        amount_due: number;
        due_date: string;
        paid: boolean;
      }[] = [
        {
          policy_id: savedPolicyId,
          sequence_number: 0,
          description: "پرداخت نقدی",
          amount_due: finalCashAmount,
          due_date: normalizeDate(form.issueDate),
          paid: false,
        },
        ...installments.map((item, index) => ({
          policy_id: savedPolicyId!,
          sequence_number: index + 1,
          description: `قسط ${index + 1}`,
          amount_due: item.amount,
          due_date: normalizeDate(item.date),
          paid: oldPaid.has(
            `${item.amount}|${normalizeDate(item.date)}`,
          ),
        })),
      ];

      const { error: deleteScheduleError } = await supabase
        .from("payment_schedule")
        .delete()
        .eq("policy_id", savedPolicyId);

      if (deleteScheduleError) throw deleteScheduleError;

      const { error: insertScheduleError } = await supabase
        .from("payment_schedule")
        .insert(schedulePayload);

      if (insertScheduleError) {
        throw new Error(
          `بیمه‌نامه ذخیره شد، اما ثبت برنامه پرداخت ناموفق بود: ${insertScheduleError.message}`,
        );
      }

      }

      await loadData();
      setPanelOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (cause) {
      setError(getErrorMessage(cause, "ذخیره بیمه‌نامه با خطا مواجه شد."));
    } finally {
      setSaving(false);
    }
  }

  const customerMatches = customers.filter((customer) => {
    const search = digits(customerSearch.trim()).toLowerCase();

    return (
      search &&
      (digits(customer.fullName).toLowerCase().includes(search) ||
        digits(customer.nationalId).includes(search))
    );
  });


  async function importPoliciesFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
const input = event.currentTarget;
const file = input.files?.[0];

console.log("[Excel Import] Handler triggered");
console.log("[Excel Import] Selected file:", file?.name);

if (!file) {
  console.warn("[Excel Import] No file selected");
  return;
}

    setImportMessage("");
    setImportError("");

    type LocalImportResult = {
      policy_number: string;
      status: "imported" | "skipped" | "failed";
      reason?: string;
    };

    const results: LocalImportResult[] = [];

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        throw new Error("شیت معتبری در فایل پیدا نشد.");
      }

      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
      });

      if (rows.length < 2) {
        throw new Error("فایل اطلاعاتی برای وارد کردن ندارد.");
      }

      const groups = groupRows(rows.slice(1));
      validateGroups(groups);

      if (groups.length === 0) {
        throw new Error("هیچ بیمه‌نامه‌ای در فایل پیدا نشد.");
      }

      const invalidGroups = groups.filter(
        (group) => group.errors.length > 0,
      );

      if (invalidGroups.length > 0) {
        const details = invalidGroups
          .map(
            (group) =>
              `ردیف ${group.excelRow}، بیمه‌نامه ${
                group.policyNumber || "بدون شماره"
              }: ${group.errors.join(" ")}`,
          )
          .join("\n");

        throw new Error(
          `${invalidGroups.length} بیمه‌نامه دارای خطا است:\n${details}`,
        );
      }

      // Import policies individually. This does not depend on a custom
      // Supabase RPC function.
      for (const group of groups) {
        try {
          // Skip policies that already exist.
          const { data: existingPolicy, error: existingError } =
            await supabase
              .from("policies")
              .select("id")
              .eq("policy_number", group.policyNumber)
              .maybeSingle();

          if (existingError) {
            throw existingError;
          }

          if (existingPolicy) {
            results.push({
              policy_number: group.policyNumber,
              status: "skipped",
              reason: "این شماره بیمه‌نامه قبلاً ثبت شده است",
            });
            continue;
          }

          // Find or create the customer using the national ID.
          const { data: customer, error: customerError } =
            await supabase
              .from("customers")
              .upsert(
                {
                  full_name: group.clientName,
                  id_number: group.clientIdNumber,
                  mobile: group.mobile || null,
                  address: group.address || null,
                },
                { onConflict: "id_number" },
              )
              .select("id")
              .single();

          if (customerError) {
            throw customerError;
          }

          const totalAmount = group.schedule.reduce(
            (sum, item) => sum + item.amount,
            0,
          );

          // The first schedule entry is the cash payment.
          // Remaining entries are installments.
          const cashPayment = group.schedule[0];
          const installmentRows = group.schedule.slice(1);

          // Keep dates in the same Jalali text format used by the
          // existing policy-management page.
          const { data: insertedPolicy, error: policyError } =
            await supabase
              .from("policies")
              .insert({
                customer_id: customer.id,
                policy_number: group.policyNumber,
                policy_type: group.policyType as PolicyType,
                issue_date: group.startDateDisplay,
                start_date: group.startDateDisplay,
                end_date: group.endDateDisplay,
                total_price: totalAmount,
                payment_type:
                  installmentRows.length > 0 ? "اقساطی" : "نقد",
                cash_amount: cashPayment.amount,
                installment_count: installmentRows.length,
                first_installment_date:
                  installmentRows[0]?.displayDate ?? "",
              })
              .select("id")
              .single();

          if (policyError) {
            throw policyError;
          }

          // Create the payment schedule, including the cash payment.
          const schedulePayload = group.schedule.map(
            (item, index) => ({
              policy_id: insertedPolicy.id,
              sequence_number: index,
              description:
                index === 0
                  ? "پرداخت نقدی"
                  : `قسط ${index}`,
              amount_due: item.amount,
              due_date: item.displayDate,
              paid: false,
            }),
          );

          const { error: scheduleError } = await supabase
            .from("payment_schedule")
            .insert(schedulePayload);

          if (scheduleError) {
            // Avoid leaving a policy behind without its payment schedule.
            // The database schema uses ON DELETE CASCADE for schedules.
            const { error: rollbackError } = await supabase
              .from("policies")
              .delete()
              .eq("id", insertedPolicy.id);

            if (rollbackError) {
              throw new Error(
                `ثبت برنامه پرداخت ناموفق بود: ${scheduleError.message}. ` +
                  `حذف بیمه‌نامه ناقص نیز ناموفق بود: ${rollbackError.message}`,
              );
            }

            throw new Error(
              `ثبت برنامه پرداخت ناموفق بود: ${scheduleError.message}`,
            );
          }

          results.push({
            policy_number: group.policyNumber,
            status: "imported",
          });
                 } catch (cause: unknown) {
          console.error(
            `[Excel Import] Failed policy ${group.policyNumber}:`,
            cause,
          );

          let reason = "خطای نامشخص";

          if (cause instanceof Error) {
            reason = cause.message;
          } else if (cause && typeof cause === "object") {
            const error = cause as {
              message?: unknown;
              details?: unknown;
              hint?: unknown;
              code?: unknown;
            };

            reason = [
              error.message,
              error.details,
              error.hint,
              error.code ? `Code: ${String(error.code)}` : "",
            ]
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              )
              .join(" | ") || JSON.stringify(cause);
          } else if (cause != null) {
            reason = String(cause);
          }

          results.push({
            policy_number: group.policyNumber,
            status: "failed",
            reason,
          });
        }
      }

      // results is always a local array, never the raw RPC response.
      const importedCount = results.filter(
        (result) => result.status === "imported",
      ).length;

      const skipped = results.filter(
        (result) => result.status === "skipped",
      );

      const failed = results.filter(
        (result) => result.status === "failed",
      );

      await loadData();

      const messages = [
        `${formatMoney(importedCount)} بیمه‌نامه ثبت شد.`,
        skipped.length
          ? `${formatMoney(skipped.length)} مورد رد شد: ${skipped
              .map(
                (item) =>
                  `${item.policy_number} (${item.reason ?? "تکراری"})`,
              )
              .join("، ")}`
          : "",
        failed.length
          ? `${formatMoney(failed.length)} مورد ناموفق بود: ${failed
              .map(
                (item) =>
                  `${item.policy_number} (${item.reason ?? "خطای نامشخص"})`,
              )
              .join("، ")}`
          : "",
      ].filter(Boolean);

      setImportMessage(messages.join(" "));
    } catch (cause) {
      setImportError(
        cause instanceof Error
          ? cause.message
          : "خواندن یا وارد کردن فایل با خطا مواجه شد.",
      );
    } finally {
      input.value = "";
    }
  }


  return (
    <AppShell>
      <div
        dir="rtl"
        className="min-h-screen bg-[#F6F7FC] text-slate-800"
      >
        <header className="sticky top-0 z-20 flex min-h-[82px] items-center justify-between gap-3 border-b border-[#e7ece9] bg-white/95 px-5 py-4 backdrop-blur md:px-8">
          <div>
            <h1 className="text-xl font-extrabold md:text-2xl">
              بیمه‌نامه‌ها
            </h1>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">
              جست‌وجو، مرتب‌سازی و مدیریت بیمه‌نامه‌ها
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={importPoliciesFile}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => {
                setImportError("");
                setImportMessage("");
                importFileRef.current?.click();
              }}
              className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50"
            >
              <Icon name="plus" size={17} />
              ورود گروهی با فایل
            </button>

            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Icon name="calendar" size={17} />
              دانلود قالب نمونه
            </button>

            <button
              type="button"
              onClick={openNewPolicy}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200/60 transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <Icon name="plus" size={18} />
              <span>بیمه‌نامه جدید</span>
            </button>
          </div>
        </header>

        <div className="space-y-3 px-4 pt-4 md:px-8">
          {pageError && (
            <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              خطا در دریافت اطلاعات: {pageError}
            </div>
          )}

          {importMessage && (
            <div className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {importMessage}
            </div>
          )}

          {importError && (
            <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {importError}
            </div>
          )}
        </div>

        <div className="space-y-5 p-4 md:p-8">
          <section className="rounded-2xl border border-[#e7ece9] bg-white p-4 shadow-sm md:p-5">
            <label className="mb-2 block text-sm font-bold">
              جست‌وجوی بیمه‌نامه
            </label>

            <div className="flex items-center gap-3 rounded-xl border border-[#dfe6e2] bg-[#fbfcfb] px-4 transition focus-within:border-[#708d81] focus-within:ring-2 focus-within:ring-[#708d81]/15">
              <Icon name="search" size={19} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="نام و نام خانوادگی، شماره ملی یا شماره بیمه‌نامه..."
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-xs font-semibold text-[#708d81]"
                >
                  پاک کردن
                </button>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-600">
                  مرتب‌سازی بر اساس
                </label>
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(
                      event.target.value as "recent" | "type" | "number",
                    )
                  }
                  className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white px-3 text-sm outline-none focus:border-[#708d81]"
                >
                  <option value="recent">جدیدترین</option>
                  <option value="number">شماره بیمه‌نامه</option>
                  <option value="type">نوع بیمه‌نامه</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-600">
                  ترتیب نمایش
                </label>
                <select
                  value={sortOrder}
                  onChange={(event) =>
                    setSortOrder(event.target.value as "asc" | "desc")
                  }
                  className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white px-3 text-sm outline-none focus:border-[#708d81]"
                >
                  <option value="asc">صعودی</option>
                  <option value="desc">نزولی</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-600">
                  از تاریخ صدور
                </label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-[#dfe6e2] px-3 focus-within:border-[#708d81]">
                  <Icon name="calendar" size={17} />
                  <input
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    placeholder="۱۴۰۵/۰۱/۰۱"
                    dir="ltr"
                    className="w-full bg-transparent text-left text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-600">
                  تا تاریخ صدور
                </label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-[#dfe6e2] px-3 focus-within:border-[#708d81]">
                  <Icon name="calendar" size={17} />
                  <input
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    placeholder="۱۴۰۵/۱۲/۲۹"
                    dir="ltr"
                    className="w-full bg-transparent text-left text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0ee] pt-4">
              <p className="text-xs text-slate-500">
                {loading
                  ? "در حال دریافت اطلاعات..."
                  : `${formatMoney(filteredPolicies.length)} بیمه‌نامه یافت شد`}
              </p>

              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSortBy("recent");
                  setSortOrder("desc");
                  setFromDate("");
                  setToDate("");
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-[#708d81] transition hover:bg-[#f2f6f3]"
              >
                <Icon name="filter" size={16} />
                پاک کردن فیلترها
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#e7ece9] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#edf0ee] px-5 py-4">
              <h2 className="font-extrabold">فهرست بیمه‌نامه‌ها</h2>
              <span className="rounded-lg bg-[#edf3ef] px-3 py-1.5 text-xs font-bold text-[#4d6c5e]">
                {formatMoney(filteredPolicies.length)} مورد
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-right text-sm">
                <thead className="bg-[#f7f9f8] text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-bold">نام و نام خانوادگی</th>
                    <th className="px-5 py-4 font-bold">شماره بیمه‌نامه</th>
                    <th className="px-5 py-4 font-bold">نوع بیمه‌نامه</th>
                    <th className="px-5 py-4 font-bold">تاریخ صدور</th>
                    <th className="px-5 py-4 font-bold">تاریخ پایان</th>
                    <th className="px-5 py-4 font-bold">عملیات</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#edf0ee]">
                  {paginatedPolicies.map((policy) => (
                    <tr
                      key={policy.id}
                      className="transition hover:bg-[#fbfcfb]"
                    >
                      <td className="px-5 py-4 font-bold">
                        {policy.fullName}
                        <p className="mt-1 text-xs font-normal text-slate-400">
                          {policy.phone}
                        </p>
                      </td>
                     <td className="px-5 py-4" dir="ltr">
  <Link
    href={`/policies/${policy.id}`}
    className="font-bold text-indigo-700 underline-offset-4
               transition hover:text-indigo-900 hover:underline"
  >
    {policy.policyNumber}
  </Link>
</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-lg bg-[#edf3ef] px-2.5 py-1.5 text-xs font-bold text-[#4d6c5e]">
                          {policy.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600" dir="ltr">
                        {policy.issueDate}
                      </td>
                      <td className="px-5 py-4 text-slate-600" dir="ltr">
                        {policy.endDate}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => openEditPolicy(policy)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#557766] transition hover:bg-[#edf3ef]"
                        >
                          <Icon name="edit" size={15} />
                          ویرایش
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && filteredPolicies.length === 0 && (
                <div className="flex flex-col items-center px-5 py-16 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf3ef] text-[#708d81]">
                    <Icon name="search" size={25} />
                  </div>
                  <p className="font-bold">بیمه‌نامه‌ای پیدا نشد</p>
                  <p className="mt-2 text-sm text-slate-500">
                    عبارت جست‌وجو یا محدوده تاریخ را تغییر دهید.
                  </p>
                </div>
              )}
            </div>

            {!loading && filteredPolicies.length > PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0ee] px-5 py-4">
                <p className="text-xs text-slate-500">
                  نمایش {formatMoney(pageStart + 1)} تا{" "}
                  {formatMoney(
                    Math.min(pageStart + PAGE_SIZE, filteredPolicies.length),
                  )}{" "}
                  از {formatMoney(filteredPolicies.length)} بیمه‌نامه
                </p>

                <nav
                  className="flex flex-wrap items-center gap-1"
                  aria-label="صفحه‌بندی"
                >
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[#557766] transition hover:bg-[#edf3ef] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    قبلی
                  </button>

                  {getPageNumbers(currentPage, totalPages).map((item, index) =>
                    item === "…" ? (
                      <span
                        key={`gap-${index}`}
                        className="px-2 text-xs text-slate-400"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goToPage(item)}
                        aria-current={item === currentPage ? "page" : undefined}
                        className={`min-w-[34px] rounded-lg px-2.5 py-2 text-xs font-bold transition ${
                          item === currentPage
                            ? "bg-[#001427] text-white"
                            : "text-slate-600 hover:bg-[#edf3ef]"
                        }`}
                      >
                        {formatMoney(item)}
                      </button>
                    ),
                  )}

                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-[#557766] transition hover:bg-[#edf3ef] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    بعدی
                  </button>
                </nav>
              </div>
            )}
          </section>
        </div>

        {panelOpen && (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="بستن فرم"
              onClick={() => setPanelOpen(false)}
              className="absolute inset-0 bg-[#001427]/40 backdrop-blur-[2px]"
            />

            <aside className="absolute inset-y-0 right-0 flex w-full max-w-[660px] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#e7ece9] px-5 py-4 md:px-7">
                <div>
                  <h2 className="text-lg font-extrabold">
                    {editingId ? "ویرایش بیمه‌نامه" : "ثبت بیمه‌نامه جدید"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    اطلاعات بیمه‌گذار، بیمه‌نامه و پرداخت
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
                  aria-label="بستن"
                >
                  <Icon name="close" />
                </button>
              </div>

              <form
                onSubmit={savePolicy}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 md:px-7">
                  {error && (
                    <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                      {error}
                    </div>
                  )}

                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold">اطلاعات بیمه‌گذار</h3>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer((value) => !value)}
                        className="flex items-center gap-1 text-xs font-bold text-[#557766] hover:underline"
                      >
                        <Icon name="plus" size={15} />
                        {showNewCustomer
                          ? "انتخاب مشتری"
                          : "افزودن مشتری جدید"}
                      </button>
                    </div>

                    {!showNewCustomer && (
                      <div className="relative">
                        <label className="mb-2 block text-xs font-bold text-slate-600">
                          جست‌وجوی بیمه‌گذار در مشتریان
                        </label>

                        <div className="flex h-12 items-center gap-2 rounded-xl border border-[#dfe6e2] px-3 focus-within:border-[#708d81]">
                          <Icon name="search" size={17} />
                          <input
                            value={customerSearch}
                            onChange={(event) => {
                              setCustomerSearch(event.target.value);
                              setForm((previous) => ({
                                ...previous,
                                customerId: "",
                                fullName: event.target.value,
                              }));
                            }}
                            placeholder="نام یا شماره ملی را وارد کنید..."
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </div>

                        {customerSearch && customerMatches.length > 0 && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-[#dfe6e2] bg-white shadow-sm">
                            {customerMatches.map((customer) => (
                              <button
                                key={customer.id}
                                type="button"
                                onClick={() => selectCustomer(customer)}
                                className="flex w-full items-center justify-between border-b border-[#edf0ee] px-4 py-3 text-right last:border-0 hover:bg-[#f4f7f5]"
                              >
                                <span>
                                  <span className="block text-sm font-bold">
                                    {customer.fullName}
                                  </span>
                                  <span className="mt-1 block text-xs text-slate-500">
                                    کد ملی: {customer.nationalId}
                                  </span>
                                </span>
                                <span className="text-xs font-bold text-[#708d81]">
                                  انتخاب
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {!form.customerId &&
                          customerSearch &&
                          customerMatches.length === 0 && (
                            <p className="mt-2 text-xs text-slate-500">
                              مشتری پیدا نشد. برای ثبت اطلاعات جدید، «افزودن
                              مشتری جدید» را بزنید.
                            </p>
                          )}
                      </div>
                    )}

                    {showNewCustomer && (
                      <div className="space-y-3 rounded-xl border border-[#dfe6e2] bg-[#fafcfb] p-4">
                        <p className="text-xs leading-5 text-slate-500">
                          اطلاعات مشتری جدید را وارد کنید. مشتری هنگام ثبت
                          ذخیره می‌شود.
                        </p>

                        <div>
                          <label className="mb-1.5 block text-xs font-bold">
                            نام و نام خانوادگی
                          </label>
                          <input
                            value={form.fullName}
                            onChange={(event) =>
                              updateForm("fullName", event.target.value)
                            }
                            className="h-11 w-full rounded-lg border border-[#dfe6e2] bg-white px-3 text-sm outline-none focus:border-[#708d81]"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold">
                              شماره ملی
                            </label>
                            <input
                              value={form.nationalId}
                              onChange={(event) =>
                                updateForm(
                                  "nationalId",
                                  digits(event.target.value),
                                )
                              }
                              dir="ltr"
                              className="h-11 w-full rounded-lg border border-[#dfe6e2] bg-white px-3 text-sm outline-none focus:border-[#708d81]"
                              required
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-bold">
                              شماره تماس
                            </label>
                            <input
                              value={form.phone}
                              onChange={(event) =>
                                updateForm("phone", digits(event.target.value))
                              }
                              dir="ltr"
                              className="h-11 w-full rounded-lg border border-[#dfe6e2] bg-white px-3 text-sm outline-none focus:border-[#708d81]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-bold">
                            آدرس
                          </label>
                          <textarea
                            value={form.address}
                            onChange={(event) =>
                              updateForm("address", event.target.value)
                            }
                            rows={2}
                            className="w-full rounded-lg border border-[#dfe6e2] bg-white px-3 py-2 text-sm outline-none focus:border-[#708d81]"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={addCustomerInPlace}
                          className="rounded-lg bg-[#708d81] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#5c776a] disabled:opacity-50"
                        >
                          {saving ? "در حال ثبت..." : "ثبت مشتری و ادامه"}
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          نام و نام خانوادگی
                        </label>
                        <input
                          value={form.fullName}
                          onChange={(event) =>
                            updateForm("fullName", event.target.value)
                          }
                          className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-sm outline-none focus:border-[#708d81]"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          شماره ملی
                        </label>
                        <input
                          value={form.nationalId}
                          onChange={(event) =>
                            updateForm(
                              "nationalId",
                              digits(event.target.value),
                            )
                          }
                          dir="ltr"
                          className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-sm outline-none focus:border-[#708d81]"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          شماره تماس
                        </label>
                        <input
                          value={form.phone}
                          onChange={(event) =>
                            updateForm("phone", digits(event.target.value))
                          }
                          dir="ltr"
                          className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-sm outline-none focus:border-[#708d81]"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          آدرس
                        </label>
                        <input
                          value={form.address}
                          onChange={(event) =>
                            updateForm("address", event.target.value)
                          }
                          className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-sm outline-none focus:border-[#708d81]"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-[#edf0ee] pt-5">
                    <h3 className="font-extrabold">اطلاعات بیمه‌نامه</h3>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-600">
                        شماره بیمه‌نامه
                      </label>
                      <input
                        value={form.policyNumber}
                        onChange={(event) =>
                          updateForm(
                            "policyNumber",
                            digits(event.target.value),
                          )
                        }
                        dir="ltr"
                        className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-sm outline-none focus:border-[#708d81]"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold text-slate-600">
                        نوع بیمه‌نامه
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {policyTypes.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => updateForm("type", type)}
                            className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                              form.type === type
                                ? "border-[#708d81] bg-[#edf3ef] text-[#4d6c5e]"
                                : "border-[#dfe6e2] text-slate-600 hover:border-[#a7b8ae]"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["issueDate", "تاریخ صدور"],
                          ["startDate", "تاریخ شروع"],
                          ["endDate", "تاریخ پایان"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <label className="mb-1.5 block text-xs font-bold text-slate-600">
                            {label} (شمسی)
                          </label>
                          <input
                            value={form[key]}
                            onChange={(event) =>
                              updateForm(key, digits(event.target.value))
                            }
                            placeholder="۱۴۰۵/۰۷/۰۳"
                            dir="ltr"
                            className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-left text-sm outline-none focus:border-[#708d81]"
                            required
                          />
                        </div>
                      ))}

                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600">
                          مبلغ بیمه‌نامه (تومان)
                        </label>
                        <input
                          value={form.amount}
                          onChange={(event) =>
                            updateForm(
                              "amount",
                              digits(event.target.value).replace(/[^\d]/g, ""),
                            )
                          }
                          inputMode="numeric"
                          dir="ltr"
                          placeholder="مثلاً ۱۲۰۰۰۰۰۰"
                          className="h-11 w-full rounded-xl border border-[#dfe6e2] px-3 text-left text-sm outline-none focus:border-[#708d81]"
                          required
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-[#edf0ee] pt-5">
                    <h3 className="font-extrabold">نحوه پرداخت</h3>

                    <div className="grid grid-cols-2 gap-3">
                      {(["نقد", "اقساطی"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateForm("paymentType", type)}
                          className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
                            form.paymentType === type
                              ? "border-[#708d81] bg-[#edf3ef] text-[#4d6c5e]"
                              : "border-[#dfe6e2] text-slate-600 hover:border-[#a7b8ae]"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    {form.paymentType === "اقساطی" && (
                      <div className="space-y-4 rounded-2xl border border-[#dfe6e2] bg-[#fafcfb] p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-600">
                              مبلغ بخش نقدی (تومان)
                            </label>
                            <input
                              value={form.cashAmount}
                              onChange={(event) =>
                                updateForm(
                                  "cashAmount",
                                  digits(event.target.value).replace(
                                    /[^\d]/g,
                                    "",
                                  ),
                                )
                              }
                              inputMode="numeric"
                              dir="ltr"
                              className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white px-3 text-left text-sm outline-none focus:border-[#708d81]"
                            />
                          </div>

                          <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-600">
                              تعداد اقساط
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="120"
                              value={form.installmentCount}
                              onChange={(event) =>
                                updateForm(
                                  "installmentCount",
                                  event.target.value,
                                )
                              }
                              dir="ltr"
                              className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white px-3 text-left text-sm outline-none focus:border-[#708d81]"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="mb-1.5 block text-xs font-bold text-slate-600">
                              تاریخ قسط اول (شمسی)
                            </label>
                            <input
                              value={form.firstInstallmentDate}
                              onChange={(event) =>
                                updateForm(
                                  "firstInstallmentDate",
                                  digits(event.target.value),
                                )
                              }
                              placeholder="۱۴۰۵/۰۸/۰۳"
                              dir="ltr"
                              className="h-11 w-full rounded-xl border border-[#dfe6e2] bg-white px-3 text-left text-sm outline-none focus:border-[#708d81]"
                            />
                          </div>
                        </div>

                        <div className="rounded-xl bg-[#001427] p-4 text-white">
                          <p className="text-xs text-slate-300">
                            مبلغ هر قسط (محاسبه خودکار)
                          </p>
                          <p className="mt-1 text-xl font-extrabold text-[#f4d58d]">
                            {previewInstallments.length
                              ? `${formatMoney(previewInstallments[0].amount)} تومان`
                              : "—"}
                          </p>
                          <p className="mt-2 text-xs text-slate-300">
                            مانده قابل پرداخت:{" "}
                            {formatMoney(Math.max(0, amount - cashAmount))}{" "}
                            تومان
                          </p>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-sm font-extrabold">
                            برنامه پرداخت اقساط
                          </h4>

                          {previewInstallments.length > 0 ? (
                            previewInstallments.map((installment, index) => (
                              <div
                                key={`${index}-${installment.date}`}
                                className="grid grid-cols-2 gap-3 rounded-xl border border-[#e3eae5] bg-white p-3"
                              >
                                <div>
                                  <p className="text-xs text-slate-500">
                                    مبلغ قسط {formatMoney(index + 1)}
                                  </p>
                                  <p className="mt-1 text-sm font-bold">
                                    {formatMoney(installment.amount)} تومان
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500">
                                    تاریخ قسط {formatMoney(index + 1)}
                                  </p>
                                  <p
                                    className="mt-1 text-sm font-bold"
                                    dir="ltr"
                                  >
                                    {installment.date || "—"}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="rounded-xl border border-dashed border-[#dfe6e2] p-4 text-xs leading-6 text-slate-500">
                              برای مشاهده اقساط، مبلغ بیمه‌نامه، مبلغ نقدی،
                              تعداد اقساط و تاریخ قسط اول را وارد کنید.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                <div className="flex gap-3 border-t border-[#e7ece9] bg-white px-5 py-4 md:px-7">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-xl bg-[#001427] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#17354a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? "در حال ذخیره..."
                      : editingId
                        ? "ذخیره تغییرات"
                        : "ثبت بیمه‌نامه"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-xl border border-[#dfe6e2] px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}