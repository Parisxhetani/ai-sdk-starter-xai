"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"

interface UseCopyToClipboardOptions {
  successMessage?: string
  errorMessage?: string
  showToast?: boolean
}

export function useCopyToClipboard({
  successMessage = "Copied to clipboard!",
  errorMessage = "Failed to copy",
  showToast = true,
}: UseCopyToClipboardOptions = {}) {
  const [isCopied, setIsCopied] = useState(false)

  const copy = useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard) {
          // Fallback for older browsers
          const textarea = document.createElement("textarea")
          textarea.value = text
          textarea.style.position = "fixed"
          textarea.style.opacity = "0"
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand("copy")
          document.body.removeChild(textarea)
        } else {
          await navigator.clipboard.writeText(text)
        }

        setIsCopied(true)
        if (showToast) {
          toast.success(successMessage)
        }

        setTimeout(() => setIsCopied(false), 2000)
        return true
      } catch (err) {
        if (showToast) {
          toast.error(errorMessage)
        }
        return false
      }
    },
    [successMessage, errorMessage, showToast]
  )

  return { isCopied, copy }
}
