"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Banknote,
  Bitcoin,
  CheckCircle,
  Clock,
  CreditCard,
  Landmark,
  LoaderCircle,
  Smartphone,
  Wallet,
  XCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type WithdrawalStatus = "pending" | "error" | "success"
type Profile = { balanceCents: number; withdrawalStatus?: unknown }
type PaymentMethod = (typeof paymentMethods)[number]["id"]

const paymentMethods = [
  { id: "bank", label: "Bank transfer", icon: Landmark },
  { id: "card", label: "Credit card", icon: CreditCard },
  { id: "apple-pay", label: "Apple Pay", icon: Smartphone },
  { id: "cash-app", label: "Cash App", icon: Banknote },
  { id: "paypal", label: "PayPal", icon: Wallet },
  { id: "crypto", label: "Crypto wallet", icon: Bitcoin },
] as const

const outcomes: Record<
  WithdrawalStatus,
  { title: string; description: string; icon: typeof CheckCircle; className: string }
> = {
  pending: {
    title: "Pending admin approval",
    description: "This practice profile is marked pending in the existing administrator dashboard.",
    icon: Clock,
    className: "bg-amber-50 text-amber-700",
  },
  error: {
    title: "Withdrawal failed",
    description: "This practice profile is marked as an error in the existing administrator dashboard.",
    icon: XCircle,
    className: "bg-red-50 text-red-700",
  },
  success: {
    title: "Withdrawal successful!",
    description: "This practice profile is marked successful in the existing administrator dashboard.",
    icon: CheckCircle,
    className: "bg-green-50 text-green-800",
  },
}

async function fetchProfile(url: string): Promise<Profile> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Sign in again to view your profile." : "Could not load your profile.")
  }
  return response.json()
}

function normalizeStatus(status: unknown): WithdrawalStatus {
  if (status === "error" || status === "success") return status
  return "pending"
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function maxAmountForBalance(balanceCents: number) {
  let amountCents = Math.floor(balanceCents / 1.01)
  while (amountCents > 0 && amountCents + Math.round(amountCents * 0.01) > balanceCents) {
    amountCents -= 1
  }
  while (
    amountCents + 1 + Math.round((amountCents + 1) * 0.01) <= balanceCents
  ) {
    amountCents += 1
  }
  return amountCents
}

export function WithdrawalDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [amount, setAmount] = useState("")
  const [amountError, setAmountError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [outcome, setOutcome] = useState<WithdrawalStatus | null>(null)
  const {
    data: profile,
    error: profileError,
    isLoading,
    mutate,
  } = useSWR<Profile>(open ? "/api/profile" : null, fetchProfile, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const balanceCents = Number(profile?.balanceCents || 0)
  const amountCents = Math.round((Number(amount) || 0) * 100)
  const feeCents = Math.round(amountCents * 0.01)
  const totalCents = amountCents + feeCents
  const maxAmountCents = maxAmountForBalance(balanceCents)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep(1)
      setMethod(null)
      setAmount("")
      setAmountError("")
      setProcessing(false)
      setOutcome(null)
    }
    onOpenChange(nextOpen)
  }

  async function reviewWithdrawal() {
    if (!profile) {
      setAmountError("Your profile is not ready yet. Try again in a moment.")
      return
    }
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      setAmountError("Enter an amount greater than $0.00.")
      return
    }
    if (totalCents > balanceCents) {
      setAmountError("Amount plus the 1% mock fee must fit within your available balance.")
      return
    }

    setStep(3)
    setProcessing(true)
    setAmountError("")
    try {
      await new Promise((resolve) => setTimeout(resolve, 650))
      const latestProfile = await mutate()
      if (!latestProfile) throw new Error("Profile unavailable")
      setOutcome(normalizeStatus(latestProfile.withdrawalStatus))
    } catch {
      toast.error("Could not refresh your withdrawal status.")
      setStep(2)
    } finally {
      setProcessing(false)
    }
  }

  const currentOutcome = outcome ?? normalizeStatus(profile?.withdrawalStatus)
  const outcomeDetails = outcomes[currentOutcome]
  const OutcomeIcon = outcomeDetails.icon

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1.5rem)] gap-5 overflow-y-auto rounded-3xl p-5 sm:max-w-md">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="text-xl font-bold tracking-tight">
            Withdraw virtual cash
          </DialogTitle>
          <DialogDescription>
            A practice-only flow. No payment details are collected and no real payout occurs.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <section aria-labelledby="withdraw-method-title" className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 id="withdraw-method-title" className="font-semibold">Choose a payment method</h3>
              <span className="text-xs font-medium text-muted-foreground">Step 1 of 3</span>
            </div>
            {isLoading && <p role="status" className="text-sm text-muted-foreground">Loading your practice balance…</p>}
            {profileError && <p role="alert" className="text-sm text-destructive">{profileError.message}</p>}
            <ToggleGroup
              variant="outline"
              spacing={2}
              value={method ? [method] : []}
              onValueChange={(value) => {
                if (!value.length) return
                setMethod(value[0] as PaymentMethod)
                setStep(2)
              }}
              className="grid w-full grid-cols-2"
              aria-label="Withdrawal payment method"
            >
              {paymentMethods.map(({ id, label, icon: MethodIcon }) => (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  disabled={isLoading || Boolean(profileError)}
                  aria-label={label}
                  className="h-auto min-h-16 w-full justify-start gap-2 rounded-xl border border-border bg-background px-3 py-3 text-left text-xs font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                >
                  <MethodIcon aria-hidden="true" />
                  <span>{label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-5" aria-label="Withdrawal amount">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft data-icon="inline-start" /> Method
              </Button>
              <span className="text-xs font-medium text-muted-foreground">Step 2 of 3</span>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="text-sm font-semibold">{paymentMethods.find((item) => item.id === method)?.label}</p>
              <p className="text-xs text-muted-foreground">Selected practice payout method</p>
            </div>
            <FieldGroup>
              <Field data-invalid={Boolean(amountError)}>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="withdrawal-amount">Withdrawal amount</FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAmount((maxAmountCents / 100).toFixed(2))
                      setAmountError("")
                    }}
                    disabled={!profile || maxAmountCents <= 0}
                  >
                    Max
                  </Button>
                </div>
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="withdrawal-amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={(maxAmountCents / 100).toFixed(2)}
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value)
                      setAmountError("")
                    }}
                    aria-invalid={Boolean(amountError)}
                    className="h-12 pl-8 text-base font-semibold tabular-nums"
                  />
                </div>
                <FieldDescription>
                  Available practice balance: {formatCents(balanceCents)}
                </FieldDescription>
                {amountError && <FieldError>{amountError}</FieldError>}
              </Field>
            </FieldGroup>
            <div className="flex flex-col gap-2 rounded-2xl border bg-background p-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Withdrawal amount</span><span className="font-semibold tabular-nums">{formatCents(amountCents)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Mock fee · 1%</span><span className="font-semibold tabular-nums">{formatCents(feeCents)}</span></div>
              <div className="my-1 h-px bg-border" />
              <div className="flex justify-between gap-4"><span className="font-semibold">Estimated total</span><span className="font-bold tabular-nums">{formatCents(totalCents)}</span></div>
            </div>
            <Button
              className="w-full"
              onClick={reviewWithdrawal}
              disabled={isLoading || Boolean(profileError) || !method || amountCents <= 0}
            >
              Review withdrawal <ArrowRight data-icon="inline-end" />
            </Button>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col items-center gap-4 py-2 text-center" aria-live="polite">
            {processing ? (
              <>
                <LoaderCircle className="animate-spin text-primary" size={36} aria-hidden="true" />
                <h3 className="text-lg font-bold">Checking withdrawal status…</h3>
                <p className="max-w-sm text-sm text-muted-foreground">Reading the latest status from your Pulse profile.</p>
              </>
            ) : (
              <>
                <div className={`grid size-16 place-items-center rounded-full ${outcomeDetails.className}`}>
                  <OutcomeIcon size={30} aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold">{outcomeDetails.title}</h3>
                <p className="max-w-sm text-sm text-muted-foreground">{outcomeDetails.description}</p>
                <p className="max-w-sm text-xs text-muted-foreground">The fee and payout are illustrative only. This demo does not move your balance or send a payment.</p>
                <Button className="mt-2 w-full" onClick={() => handleOpenChange(false)}>Done</Button>
              </>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
