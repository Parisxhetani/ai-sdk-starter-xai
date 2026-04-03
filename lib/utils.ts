import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatLekPrice(priceAll?: number | null) {
  if (typeof priceAll !== "number" || Number.isNaN(priceAll) || priceAll <= 0) {
    return null
  }

  return `ALL ${priceAll}`
}

export function formatMenuVariantLabel(variant: string, priceAll?: number | null) {
  const formattedPrice = formatLekPrice(priceAll)
  return formattedPrice ? `${variant} - ${formattedPrice}` : variant
}
