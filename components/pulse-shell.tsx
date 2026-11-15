"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { WithdrawalDialog } from "@/components/withdrawal-dialog"

const simulatedActivity = [
  "Michael B. just deposited $1,500 in virtual funds",
  "Sarah K. completed an $850 practice withdrawal",
  "Jordan T. added $320 to a practice balance",
  "Alex R. completed a $240 demo withdrawal",
]

export default function PulseShell() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [withdrawalOpen, setWithdrawalOpen] = useState(false)

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      ) {
        return
      }

      const message = event.data as {
        source?: string
        type?: string
        authenticated?: boolean
      }

      if (message?.source !== "pulse-app") return
      if (message.type === "session") {
        setAuthenticated(message.authenticated === true)
      }
      if (message.type === "withdraw") {
        setWithdrawalOpen(true)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  useEffect(() => {
    if (!authenticated || withdrawalOpen) return

    let timer: ReturnType<typeof setTimeout>
    function scheduleActivity() {
      timer = setTimeout(() => {
        const event = simulatedActivity[Math.floor(Math.random() * simulatedActivity.length)]
        toast.success(event, {
          description: "Simulated activity · no payments or balance changes",
          duration: 5000,
        })
        scheduleActivity()
      }, 10000 + Math.random() * 5000)
    }

    scheduleActivity()
    return () => clearTimeout(timer)
  }, [authenticated, withdrawalOpen])

  return (
    <main className="h-[100dvh] w-full overflow-hidden bg-white">
      <iframe
        ref={frameRef}
        title="Pulse virtual portfolio"
        src="/pulse.html"
        className="block h-full w-full border-0"
      />
      <Toaster position="top-center" theme="light" richColors closeButton />
      <WithdrawalDialog
        open={withdrawalOpen}
        onOpenChange={setWithdrawalOpen}
      />
    </main>
  )
}
