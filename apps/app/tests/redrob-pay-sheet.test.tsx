import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { MessageList } from "../src/components/chat/message-list"
import { MessageListProvider } from "../src/components/chat/message-list-provider"
import en from "../src/i18n/locales/en"
import ko from "../src/i18n/locales/ko"
import {
  classifyRedrobPaymentRefusal,
  redrobCheckoutUrl,
  redrobPayInitialState,
  redrobPaymentRefusalFromMessages,
  redrobPayReducer,
  redrobPayStatusKey,
  REDROB_PAY_STATUS_KEYS,
  type RedrobPayEvent,
  type RedrobPayState,
} from "../src/react-app/domains/billing/redrob-pay"
import { RedrobPayNotice, RedrobPayPanel } from "../src/react-app/domains/billing/redrob-pay-sheet"
import { REDROB_CONSOLE_BILLING_URL } from "../src/react-app/domains/settings/redrob-provider"
import { createSessionErrorUIMessage } from "../src/react-app/domains/session/sync/usechat-adapter"
import { presentOpencodeSessionError } from "../src/react-app/domains/session/sync/session-error"

/**
 * The pay sheet's contract: a user can see that the workspace is out of credit and start a payment
 * from inside Redrob Cowork, and Redrob Cowork never says a payment happened.
 *
 * The second half is the part worth guarding. Work has no authenticated way to read a balance, so
 * every status line it can show is enumerated here and checked for a success claim.
 */
describe("redrob pay sheet", () => {
  test("classifies the console refusing for want of credit", () => {
    const refusal = classifyRedrobPaymentRefusal(
      "Message: Insufficient credit for this request\nStatus: 402\nProvider: redrob",
    )

    expect(refusal).not.toBeNull()
    expect(refusal?.signal).toBe("insufficient_credit")
    expect(refusal?.detail).toBe("Message: Insufficient credit for this request")
  })

  test("classifies a bare payment-required refusal", () => {
    expect(classifyRedrobPaymentRefusal("Status: 402")?.signal).toBe("payment_required")
    expect(classifyRedrobPaymentRefusal("402 Payment Required")?.signal).toBe("payment_required")
  })

  test("leaves other failures alone", () => {
    for (const text of [
      null,
      "",
      "Message: Provider response headers timed out after 10000ms",
      "Message: Rate limit exceeded\nStatus: 429",
      // 402 that is not a status: a token count or a model name must not read as a bill.
      "Message: 402 tokens remaining in the context window",
    ]) {
      expect(classifyRedrobPaymentRefusal(text)).toBeNull()
    }
  })

  test("does not offer a Redrob top-up for another provider's bill", () => {
    expect(
      classifyRedrobPaymentRefusal("Message: Insufficient credit\nStatus: 402\nProvider: openai"),
    ).toBeNull()
  })

  test("reads the refusal back off a reloaded transcript", () => {
    const message = createSessionErrorUIMessage(
      "assistant-turn",
      presentOpencodeSessionError({
        name: "AI_APICallError",
        data: {
          message: "Insufficient credit. Add credit to continue.",
          statusCode: 402,
          providerID: "redrob",
        },
      }),
    )

    expect(redrobPaymentRefusalFromMessages([message])?.signal).toBe("insufficient_credit")
  })

  test("ignores a refusal that a later turn already ran past", () => {
    const refused = createSessionErrorUIMessage(
      "turn-1",
      presentOpencodeSessionError({ data: { message: "Insufficient credit", statusCode: 402 } }),
    )
    const laterFailure = createSessionErrorUIMessage(
      "turn-2",
      presentOpencodeSessionError({ name: "MessageAbortedError", data: { message: "Aborted" } }),
    )

    expect(redrobPaymentRefusalFromMessages([refused, laterFailure])).toBeNull()
  })

  test("the checkout is the console's own page, with no amount built into it", () => {
    expect(redrobCheckoutUrl()).toBe(REDROB_CONSOLE_BILLING_URL)
    expect(REDROB_CONSOLE_BILLING_URL.startsWith("https://console.redrob.ai/")).toBe(true)
    expect(new URL(REDROB_CONSOLE_BILLING_URL).search).toBe("")
  })

  test("opening the checkout is a handoff, never a payment", () => {
    const refusal = { signal: "insufficient_credit" as const, detail: "Insufficient credit" }
    let state = redrobPayInitialState(refusal)
    expect(redrobPayStatusKey(state)).toBe("billing.pay_status_refused")

    state = redrobPayReducer(state, { type: "checkout-opened" })
    expect(state.handedOff).toBe(true)
    expect(redrobPayStatusKey(state)).toBe("billing.pay_status_unconfirmed")

    // The one fact Work can verify is that the engine still holds a key. It is not credit, so the
    // status stays unconfirmed.
    state = redrobPayReducer(state, { type: "recheck-started" })
    expect(redrobPayStatusKey(state)).toBe("billing.pay_status_checking")
    state = redrobPayReducer(state, { type: "recheck-settled", keyConnected: true })
    expect(redrobPayStatusKey(state)).toBe("billing.pay_status_unconfirmed")

    expect(en["billing.pay_status_unconfirmed"]).toContain("cannot confirm a payment")
  })

  test("no reachable state claims a payment succeeded", () => {
    const events: RedrobPayEvent[] = [
      { type: "refused", refusal: { signal: "payment_required", detail: "Status: 402" } },
      { type: "checkout-opened" },
      { type: "recheck-started" },
      { type: "recheck-settled", keyConnected: true },
      { type: "recheck-settled", keyConnected: false },
      { type: "recheck-failed" },
    ]

    // Every state reachable in four events from a cold start.
    let frontier: RedrobPayState[] = [redrobPayInitialState()]
    const reached = new Set<string>([redrobPayStatusKey(frontier[0])])
    for (let depth = 0; depth < 4; depth += 1) {
      const next: RedrobPayState[] = []
      for (const state of frontier) {
        for (const event of events) {
          const advanced = redrobPayReducer(state, event)
          reached.add(redrobPayStatusKey(advanced))
          next.push(advanced)
        }
      }
      frontier = next
    }

    // The walk is not vacuous: it visits every status the sheet can show.
    expect([...reached].sort()).toEqual([...REDROB_PAY_STATUS_KEYS].sort())

    const successClaim = /\b(paid|succeeded|success|successful|completed?|confirmed)\b/i
    for (const key of reached) {
      const english = (en as Record<string, string>)[key]
      const korean = (ko as Record<string, string>)[key]
      expect(english).toBeString()
      expect(korean).toBeString()
      expect(english).not.toMatch(successClaim)
      // 결제됨 / 완료되었습니다: the Korean equivalents of "paid" and "done".
      expect(korean).not.toMatch(/결제됨|충전되었습니다|완료되었습니다/)
    }
  })

  test("the notice shows the refusal and puts the top-up one press away", () => {
    const html = renderToStaticMarkup(
      <RedrobPayNotice
        refusal={{ signal: "insufficient_credit", detail: "Insufficient credit" }}
        recheck={async () => true}
        openCheckout={() => undefined}
      />,
    )

    expect(html).toContain('data-testid="redrob-pay-notice"')
    expect(html).toContain(en["billing.pay_notice_title"])
    expect(html).toContain(en["billing.pay_notice_desc"])
    expect(html).toContain('data-testid="redrob-pay-notice-cta"')
    expect(html).toContain(en["billing.pay_notice_cta"])
  })

  test("the sheet explains the amount and the status, and collects no card data", () => {
    const state = redrobPayInitialState({
      signal: "insufficient_credit",
      detail: "Insufficient credit for this request",
    })
    const html = renderToStaticMarkup(
      <RedrobPayPanel state={state} onOpenCheckout={() => undefined} onRecheck={() => undefined} />,
    )

    expect(html).toContain(en["billing.pay_amount_desc"])
    expect(html).toContain(en["billing.pay_status_refused"])
    expect(html).toContain("Insufficient credit for this request")
    expect(html).toContain(en["billing.pay_open_checkout"])
    expect(html).toContain(en["billing.pay_recheck"])
    expect(html).toContain(REDROB_CONSOLE_BILLING_URL)

    // No card field, and nothing that could post one anywhere.
    expect(html).not.toContain("<input")
    expect(html).not.toContain("<form")
  })

  test("after the handoff the panel offers the console again, not a confirmation", () => {
    const state = redrobPayReducer(redrobPayInitialState(), { type: "checkout-opened" })
    const html = renderToStaticMarkup(
      <RedrobPayPanel state={state} onOpenCheckout={() => undefined} onRecheck={() => undefined} />,
    )

    expect(html).toContain(en["billing.pay_reopen_checkout"])
    expect(html).toContain(en["billing.pay_status_unconfirmed"])
    expect(html).toContain(en["billing.pay_recheck"])
  })

  test("the chat surface raises the notice when the transcript carries a refusal", () => {
    const message = createSessionErrorUIMessage(
      "assistant-turn",
      presentOpencodeSessionError({
        data: {
          message: "Insufficient credit. Add credit to continue.",
          statusCode: 402,
          providerID: "redrob",
        },
      }),
    )
    const html = renderToStaticMarkup(
      <MessageListProvider
        workspaceId="workspace-1"
        sessionId="session-1"
        showThinking={false}
        developerMode={false}
        displaySuggestions={false}
        providerConnectedCount={1}
        dispatchAction={() => undefined}
        setPrompt={() => undefined}
        onRevertToUserMessage={() => undefined}
        onForkAtMessage={() => undefined}
        onEditUserMessage={() => undefined}
      >
        <MessageList messages={[message]} status="ready" />
      </MessageListProvider>,
    )

    expect(html).toContain('data-testid="redrob-pay-notice"')
    expect(html).toContain(en["billing.pay_notice_cta"])
  })

  test("the chat surface stays quiet for a failure that is not about money", () => {
    const message = createSessionErrorUIMessage(
      "assistant-turn",
      presentOpencodeSessionError({ name: "MessageAbortedError", data: { message: "Aborted" } }),
    )
    const html = renderToStaticMarkup(
      <MessageListProvider
        workspaceId="workspace-1"
        sessionId="session-1"
        showThinking={false}
        developerMode={false}
        displaySuggestions={false}
        providerConnectedCount={1}
        dispatchAction={() => undefined}
        setPrompt={() => undefined}
        onRevertToUserMessage={() => undefined}
        onForkAtMessage={() => undefined}
        onEditUserMessage={() => undefined}
      >
        <MessageList messages={[message]} status="ready" />
      </MessageListProvider>,
    )

    expect(html).not.toContain('data-testid="redrob-pay-notice"')
  })

  test("Korean ships for every string the sheet renders", () => {
    const keys = [
      "billing.pay_title",
      "billing.pay_subtitle",
      "billing.pay_amount_title",
      "billing.pay_amount_desc",
      "billing.pay_status_title",
      "billing.pay_console_detail",
      "billing.pay_open_checkout",
      "billing.pay_reopen_checkout",
      "billing.pay_recheck",
      "billing.pay_notice_title",
      "billing.pay_notice_desc",
      "billing.pay_notice_cta",
      "settings.redrob_credit_title",
      "settings.redrob_credit_desc",
      "settings.redrob_credit_cta",
      ...REDROB_PAY_STATUS_KEYS,
    ]

    for (const key of keys) {
      const english = (en as Record<string, string>)[key]
      const korean = (ko as Record<string, string>)[key]
      expect(english).toBeString()
      expect(korean).toBeString()
      expect(english).not.toContain("\u2014")
      expect(korean).not.toContain("\u2014")
      // Korean, not an English string copied across.
      expect(korean).toMatch(/[\uAC00-\uD7A3]/)
    }
  })
})
