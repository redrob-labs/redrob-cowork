import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { t } from "@/i18n"

/**
 * Dialog, drawn as the design system's Modal (`rr-modal-scrim`, `rr-modal`,
 * `rr-modal__head` / `__title` / `__body` / `__footer`). Base UI keeps the
 * behaviour - focus trap, portal, scroll lock, dismissal - so the scrim is the
 * popup's sibling rather than its parent, and the app's dialogs lay out their own
 * head, body and footer inside the design system's 20px panel inset.
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "rr-modal-scrim fixed inset-0 isolate z-50 block p-0 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "rr-modal fixed z-50 grid gap-4 p-5 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)))] max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none max-lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-lg:data-open:slide-in-from-bottom-4 max-lg:data-closed:slide-out-to-bottom-4 lg:top-1/2 lg:inset-s-1/2 lg:w-[calc(100%-2rem)] lg:max-w-120 lg:-translate-x-1/2 rtl:lg:translate-x-1/2 lg:-translate-y-1/2 lg:data-open:zoom-in-95 lg:data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-4 inset-e-4"
                size="icon-sm"
                label={t("common.close")}
              />
            }
          >
            <XIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("rr-modal__head flex-col items-stretch gap-1 p-0 pe-8", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "rr-modal__footer -mx-5 -mb-5 flex-col-reverse sm:flex-row",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {t("common.close")}
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "rr-modal__title font-heading",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "rr-modal__body p-0 *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
