import * as jalaali from "jalaali-js";

// jalaali-js has no bundled types in some installs — declare the minimal shape used here.
declare module "jalaali-js" {
  export function toGregorian(
    jy: number,
    jm: number,
    jd: number
  ): { gy: number; gm: number; gd: number };

  export function isValidJalaaliDate(
    jy: number,
    jm: number,
    jd: number
  ): boolean;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Sane range for real Jalali dates; rejects Gregorian-looking years (e.g. 2024).
const MIN_JALALI_YEAR = 1200;
const MAX_JALALI_YEAR = 1699;

export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(ch);
    if (persianIndex > -1) return String(persianIndex);

    const arabicIndex = ARABIC_DIGITS.indexOf(ch);
    if (arabicIndex > -1) return String(arabicIndex);

    return ch;
  });
}

export function readTextValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return normalizeDigits(String(raw).trim());
}

export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return null;
  }

  // Also strip Persian thousands separator (٬) and Persian comma (،).
  const cleaned = normalizeDigits(String(raw).trim()).replace(/[,٬،]/g, "");
  const value = Number(cleaned);

  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Parses a Jalali date typed as free text (e.g. "1403/01/15", "1403-1-5")
 * and returns a Gregorian ISO date string ("YYYY-MM-DD"), or null if invalid.
 * Impossible dates (e.g. 1405/07/31 or 1405/12/30 in a non-leap year) return null.
 */
export function parseJalaliTextToGregorianISO(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  const normalized = normalizeDigits(String(raw).trim());
  const match = normalized.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);

  if (!match) return null;

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  if (jy < MIN_JALALI_YEAR || jy > MAX_JALALI_YEAR) return null;
  if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;

  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}