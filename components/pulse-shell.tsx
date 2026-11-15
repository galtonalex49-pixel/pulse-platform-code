"use client"

import { useEffect, useRef, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { WithdrawalDialog } from "@/components/withdrawal-dialog"

export default function PulseShell() {
  const frameRef = useRef<HTMLIFrameElement>(null)
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
      }

      if (message?.source !== "pulse-app") return
      if (message.type === "withdraw") {
        setWithdrawalOpen(true)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

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
