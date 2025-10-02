"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ResetResponse {
  success?: boolean
  message?: string
  error?: string
  resetUrl?: string
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setStatus(null)
    setDevResetUrl(null)

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      const data = (await response.json()) as ResetResponse
      if (!response.ok) {
        throw new Error(data.error || "Failed to request password reset")
      }

      const baseMessage =
        data.message ||
        "If your email is whitelisted, you'll receive a link to reset your password within a few minutes."

      setStatus(baseMessage)

      if (data.resetUrl && process.env.NODE_ENV !== "production") {
        setDevResetUrl(data.resetUrl)
      }

      setTimeout(() => {
        router.push("/auth/login")
      }, 6000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Forgot your password?</CardTitle>
            <CardDescription>
              Enter your work email and we&apos;ll send a reset link if you&apos;re on the whitelist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@company.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
              {status && (
                <p className="rounded-md bg-primary/5 p-3 text-sm text-primary" role="status">
                  {status}
                </p>
              )}
              {devResetUrl && (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground" role="note">
                  Dev shortcut: {" "}
                  <a href={devResetUrl} className="underline" target="_blank" rel="noreferrer">
                    {devResetUrl}
                  </a>
                </p>
              )}
              {error && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Sending reset link..." : "Send reset link"}
              </Button>
            </form>
            <div className="mt-6 space-y-1 text-center text-sm">
              <p>
                Remembered it?{" "}
                <Link href="/auth/login" className="underline underline-offset-4">
                  Back to sign in
                </Link>
              </p>
              <p>
                Need an account?{" "}
                <Link href="/auth/register" className="underline underline-offset-4">
                  Register
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
