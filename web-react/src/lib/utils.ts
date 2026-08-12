import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'] as const

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const rem100 = n % 100
  const rem10 = n % 10
  const suffix =
    rem100 >= 11 && rem100 <= 13 ? 'th' : (ORDINAL_SUFFIXES[rem10] ?? 'th')
  return `${n}${suffix}`
}
