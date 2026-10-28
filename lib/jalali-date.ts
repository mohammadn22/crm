/**
 * Shared Jalali / Gregorian date helpers.
 *
 * Conventions used across the app:
 *  - policies.*_date and payment_schedule.due_date  -> Jalali text "YYYY/MM/DD"
 *  - transactions.payment_date                      -> Gregorian ISO "YYYY-MM-DD"
 *    (a Postgres `date` column cannot hold Jalali; we convert on the way in/out)
 *
 * Every comparison in the UI is done on the Jalali key "YYYY/MM/DD"
 * (zero-padded, ASCII digits), so plain string comparison is correct.
 */
import { isValidJalaaliDate, toGregorian, toJalaali } from "jalaali-js";

/** The business day is the Tehran day, whatever the browser's time zone is. */
const APP_TIME_ZONE = "Asia/Tehran";

/** Years >= this are treated as Gregorian, smaller ones as Jalali. */
const GREGORIAN_MIN_YEAR = 1700;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

type DateParts = { year: number; month: number; day: number };

const pad = (value: number) => String(value).padStart(2, "0");

export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

/** Accepts 1405/08/06, ۱۴۰۵/۸/۶, 1405-08-06, 2026-10-28, 2026-10-28T00:00:00Z */
function splitDate(value: string | null | undefined): DateParts | null {
  if (!value) return null;

  const match = normalizeDigits(String(value))
    .trim()
    .match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function isValidGregorian({ year, month, day }: DateParts) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Any Jalali or Gregorian date string -> Jalali parts (or null if invalid). */
function toJalaliParts(value: string | null | undefined): DateParts | null {
  const parts = splitDate(value);
  if (!parts) return null;

  if (parts.year >= GREGORIAN_MIN_YEAR) {
    if (!isValidGregorian(parts)) return null;

    const { jy, jm, jd } = toJalaali(parts.year, parts.month, parts.day);
    return { year: jy, month: jm, day: jd };
  }

  if (!isValidJalaaliDate(parts.year, parts.month, parts.day)) return null;

  return parts;
}

/**
 * Canonical sortable Jalali key, "1405/08/06".
 * Works for Jalali text and Gregorian ISO input. Returns null when unparseable.
 */
export function toJalaliKey(value: string | null | undefined): string | null {
  const parts = toJalaliParts(value);
  if (!parts) return null;

  return `${parts.year}/${pad(parts.month)}/${pad(parts.day)}`;
}

/** For rendering: Jalali if parseable, the raw text if not, "—" if empty. */
export function toJalaliDisplay(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";

  return toJalaliKey(value) ?? String(value);
}

/** Jalali text (or Gregorian ISO) -> Gregorian ISO "YYYY-MM-DD", or null. */
export function jalaliTextToISO(value: string | null | undefined): string | null {
  const parts = splitDate(value);
  if (!parts) return null;

  if (parts.year >= GREGORIAN_MIN_YEAR) {
    return isValidGregorian(parts)
      ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
      : null;
  }

  if (!isValidJalaaliDate(parts.year, parts.month, parts.day)) return null;

  const { gy, gm, gd } = toGregorian(parts.year, parts.month, parts.day);
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

const todayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayGregorianParts(): DateParts {
  const parts = todayFormatter.formatToParts(new Date());
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Today's date as a Jalali key, e.g. "1405/08/06". */
export function getTodayJalali(): string {
  const { year, month, day } = todayGregorianParts();
  const { jy, jm, jd } = toJalaali(year, month, day);

  return `${jy}/${pad(jm)}/${pad(jd)}`;
}
