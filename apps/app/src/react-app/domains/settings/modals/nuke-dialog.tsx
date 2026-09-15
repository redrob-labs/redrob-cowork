/**
 * The confirm dialog for wiping this app's local data.
 *
 * It used to live inside DebugView, which returns null unless developer mode is
 * on — so the only way to reset the app was to know about a hidden toggle. The
 * dialog is now its own component because two screens show it: Debug keeps it for
 * developers, and Recovery offers it to everyone, which is where a user actually
 * looks for "start over".
 *
 * The confirmation is deliberately heavy. It lists the exact paths the main
 * process will delete, names what survives, and requires the word NUKE to be
 * typed: this erases stored credentials, every session, and the engine's own auth,
 * then quits and relaunches. A single destructive button would not be honest about
 * that.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { t } from "@/i18n";
import type { NukeManifestPreview } from "@/app/lib/desktop";

export type NukeDialogProps = {
  open: boolean;
  onClose: () => void;
  manifestPreview: NukeManifestPreview | null;
  deleteBootstrap: boolean;
  onSetDeleteBootstrap: (value: boolean) => void | Promise<void>;
  confirmationText: string;
  onSetConfirmationText: (value: string) => void;
  busy: boolean;
  previewBusy: boolean;
  onConfirm: () => void | Promise<void>;
};

export function NukeDialog(props: NukeDialogProps) {
  const canConfirm =
    props.confirmationText.trim().toUpperCase() === "NUKE" && !props.busy && !props.previewBusy;
  const deletePaths = props.manifestPreview?.deletePaths ?? [];
  const partitions = props.manifestPreview?.partitions.join(", ") || "default";

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <AlertDialogContent className="grid max-h-[calc(100dvh-2rem)] w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.nuke_dialog_title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("settings.nuke_dialog_desc")}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="rounded-xl border border-destructive-muted/30 bg-destructive-soft/10 p-3">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-destructive-ink">
              {t("settings.nuke_deleted_title")}
            </div>
            <div className="max-h-40 overflow-auto rounded-lg bg-dls-sidebar/40 p-2 font-mono text-[11px] text-dls-text">
              {deletePaths.length ? (
                <ul className="space-y-1">
                  {deletePaths.map((targetPath) => (
                    <li key={targetPath} className="break-all">{targetPath}</li>
                  ))}
                </ul>
              ) : (
                <div>{t("settings.nuke_deleted_empty")}</div>
              )}
            </div>
            <div className="mt-2 text-[11px] text-dls-secondary">
              {t("settings.nuke_partitions", { partitions })}
            </div>
          </div>

          <div className="rounded-xl border border-dls-border bg-dls-sidebar/30 p-3">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-dls-secondary">
              {t("settings.nuke_survives_title")}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[12px] text-dls-secondary">
              {props.deleteBootstrap ? null : (
                <li>
                  {t("settings.nuke_survives_bootstrap", {
                    path: props.manifestPreview?.bootstrapPath ?? t("settings.nuke_no_bootstrap_path"),
                  })}
                </li>
              )}
              <li>{t("settings.nuke_survives_app")}</li>
              <li>{t("settings.nuke_survives_workspaces")}</li>
            </ul>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-dls-border bg-dls-surface p-3">
            <Checkbox
              checked={props.deleteBootstrap}
              disabled={props.busy || props.previewBusy}
              onCheckedChange={(checked) => void props.onSetDeleteBootstrap(checked === true)}
              aria-label={t("settings.nuke_bootstrap_delete_label")}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-dls-text">
                {t("settings.nuke_bootstrap_delete_label")}
              </span>
              <span className="mt-1 block break-all text-[11px] text-dls-secondary">
                {t("settings.nuke_bootstrap_delete_desc", {
                  path: props.manifestPreview?.bootstrapPath ?? t("settings.nuke_no_bootstrap_path"),
                })}
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-dls-text">
              {t("settings.nuke_confirmation_label")}
            </span>
            <input
              type="text"
              value={props.confirmationText}
              placeholder={t("settings.nuke_confirmation_placeholder")}
              onChange={(event) => props.onSetConfirmationText(event.currentTarget.value)}
              disabled={props.busy || props.previewBusy}
              className="w-full rounded-xl border border-dls-border bg-dls-surface px-4 py-3 text-[14px] text-dls-text placeholder:text-dls-secondary focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.12)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span className="mt-1.5 block text-[11px] text-dls-secondary">
              {t("settings.nuke_confirmation_hint")}
            </span>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.busy}>{t("settings.nuke_cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void props.onConfirm()}
            disabled={!canConfirm}
          >
            {props.busy ? t("settings.removing_local_state") : t("settings.nuke_confirm_button")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
