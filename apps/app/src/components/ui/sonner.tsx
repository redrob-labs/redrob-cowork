import * as React from "react"
import { Toaster as Sonner, toast as sonnerToast, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { Toast as DsToast } from "@redrob-labs/ui"
import { getResolvedThemeMode, subscribeToTheme } from "@/app/theme"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n"

function useTheme() {
  return React.useSyncExternalStore(
    subscribeToTheme,
    getResolvedThemeMode,
    getResolvedThemeMode,
  )
}

const toasterStyle: React.CSSProperties & Record<`--${string}`, string> = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={toasterStyle}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

type ToastType = "default" | "success" | "info" | "warning" | "error"

interface ToastAction {
  label: React.ReactNode
  onClick: () => void
}

interface ToastOptions {
  id?: string | number
  description?: React.ReactNode
  action?: ToastAction
  cancel?: ToastAction
  duration?: number
}

/**
 * The app's toast types onto the design system's tones. A function declaration
 * rather than a lookup const: this module sits in an import cycle through
 * `@/i18n`, and a hoisted function cannot be read before it is initialised.
 */
function toneOf(type: ToastType): "success" | "info" | "warning" | "danger" | undefined {
  switch (type) {
    case "success":
      return "success"
    case "info":
      return "info"
    case "warning":
      return "warning"
    case "error":
      return "danger"
    case "default":
      return undefined
  }
}

interface ToastCardProps {
  id: string | number
  type: ToastType
  title: React.ReactNode
  description?: React.ReactNode
  action?: ToastAction
  cancel?: ToastAction
}

/**
 * One toast, rendered by the design system's own Toast: `rr-toast` on the raised
 * surface, the tone's icon, title, text and one action, `role="status"` with
 * `aria-live="polite"`. The design system leaves stacking, timing and dismissal to
 * the app, which is what sonner does around it. A plain toast passes no tone and
 * so is the design system's default, informational one.
 */
function ToastCard({ id, type, title, description, action, cancel }: ToastCardProps) {
  const actions =
    action || cancel ? (
      <div className="flex gap-2">
        {action ? (
          <Button
            size="sm"
            onClick={() => {
              action.onClick()
              sonnerToast.dismiss(id)
            }}
          >
            {action.label}
          </Button>
        ) : null}
        {cancel ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              cancel.onClick()
              sonnerToast.dismiss(id)
            }}
          >
            {cancel.label}
          </Button>
        ) : null}
      </div>
    ) : undefined
  return (
    <DsToast
      tone={toneOf(type)}
      title={title}
      action={actions}
      closeLabel={t("common.dismiss")}
      onClose={() => sonnerToast.dismiss(id)}
    >
      {description}
    </DsToast>
  )
}

function showToast(type: ToastType, message: React.ReactNode, options?: ToastOptions) {
  const notification = options?.action === undefined && options?.cancel === undefined;

  return sonnerToast.custom(
    (id) => (
      <ToastCard
        id={id}
        type={type}
        title={message}
        description={options?.description}
        action={options?.action}
        cancel={options?.cancel}
      />
    ),
    {
      id: options?.id,
      duration: options?.duration,
      description: undefined,
      action: undefined,
      cancel: undefined,
      position: notification ? "top-center" : "bottom-right",
    },
  )
}

const toast = Object.assign(
  (message: React.ReactNode, options?: ToastOptions) => showToast("default", message, options),
  {
    success: (message: React.ReactNode, options?: ToastOptions) => showToast("success", message, options),
    info: (message: React.ReactNode, options?: ToastOptions) => showToast("info", message, options),
    warning: (message: React.ReactNode, options?: ToastOptions) => showToast("warning", message, options),
    error: (message: React.ReactNode, options?: ToastOptions) => showToast("error", message, options),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  },
)

export { Toaster, ToastCard, toast }
