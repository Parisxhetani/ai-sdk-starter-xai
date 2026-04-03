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

export function getMenuItemLookupKey(item: string, variant: string) {
  return `${item}::${variant}`
}

export function appendPriceLabel(label: string, priceAll?: number | null) {
  const formattedPrice = formatLekPrice(priceAll)
  return formattedPrice ? `${label} (${formattedPrice})` : label
}

export function formatOrderLine(item: string, variant: string, priceAll?: number | null) {
  const baseLabel = variant ? `${item} - ${variant}` : item
  return appendPriceLabel(baseLabel, priceAll)
}
