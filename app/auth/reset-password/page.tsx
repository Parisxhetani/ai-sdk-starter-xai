"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

interface ApiResetResponse {
  success?: boolean
  message?: string
  error?: string
}

type ResetMode = "supabase" | "legacy" | "invalid"

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const token = searchParams.get("token")
  const code = searchParams.get("code")
  const type = searchParams.get("type")

  const [mode, setMode] = useState<ResetMode>("invalid")
  const [sessionReady, setSessionReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setStatus(null)
    setError(null)

    if (token) {
      setMode("legacy")
      setSessionReady(true)
      setUserEmail(null)
      return
    }

    if (code && type === "recovery") {
      setMode("supabase")
      setSessionReady(false)
      void (async () => {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          console.error("Supabase recovery exchange failed:", exchangeError.message)
          setError("This reset link is invalid or has expired. Request a new one below.")
          setMode("invalid")
          return
        }
        setUserEmail(data?.user?.email ?? null)
        setSessionReady(true)
      })()
      return
    }

    setMode("invalid")
    setSessionReady(false)
  }, [code, supabase, token, type])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setIsSubmitting(true)
    setError(null)
    setStatus(null)

    try {
      if (mode === "legacy" && token) {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        })
        const data = (await response.json()) as ApiResetResponse
        if (!response.ok) {
          throw new Error(data.error || "Failed to reset password")
        }
      } else if (mode === "supabase" && sessionReady) {
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) {
          throw new Error(updateError.message)
        }
      } else {
        throw new Error("Reset link is invalid or has expired. Request a new one below.")
      }

      setStatus("Password updated! You can now sign in with your new password.")
      setTimeout(() => {
        router.push("/auth/login")
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  const showForm = mode !== "invalid"
  const disableInputs = isSubmitting || (mode === "supabase" && !sessionReady)

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-6">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
            <CardDescription>
              {mode === "invalid"
                ? "The reset link is invalid or has expired. Request a new one below."
                : "Choose a new password you won’t forget this time."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showForm ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Looks like this link can&apos;t be used anymore. You can request another email with a fresh reset link.
                </p>
                <Button asChild variant="outline">
                  <Link href="/auth/forgot-password">Request new reset link</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "supabase" && !sessionReady && !error && (
                  <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground" role="status">
                    Verifying your reset link...
                  </p>
                )}
                {userEmail && (
                  <p className="rounded-md bg-primary/5 p-3 text-xs text-primary" role="note">
                    Resetting password for <strong>{userEmail}</strong>
                  </p>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={disableInputs}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={disableInputs}
                  />
                </div>
                {status && (
                  <p className="rounded-md bg-primary/5 p-3 text-sm text-primary" role="status">
                    {status}
                  </p>
                )}
                {error && (
                  <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={disableInputs}>
                  {isSubmitting ? "Updating password..." : "Update password"}
                </Button>
              </form>
            )}
            <div className="mt-6 text-center text-sm">
              <Link href="/auth/login" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
