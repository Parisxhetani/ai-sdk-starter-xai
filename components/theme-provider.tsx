"use client"

import type { ThemeProviderProps } from "next-themes"
import { ThemeProvider as NextThemesProvider } from "next-themes"

type AppThemeProviderProps = React.PropsWithChildren<ThemeProviderProps>

export function ThemeProvider({ children, ...props }: AppThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  )
}

export { useTheme } from "next-themes"
