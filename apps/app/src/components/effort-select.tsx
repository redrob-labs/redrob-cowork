import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Reasoning effort, as a control of its own.
 *
 * It used to be a submenu reached by clicking a MODEL inside the model popover, which meant choosing a
 * model was two clicks in two panes and was not committed until an effort level was also picked. The
 * level itself was then rendered as a chip inside the model button - a read-only display on a control
 * that does something else. Two settings sharing one button is why nobody could work out what the
 * second pane was for.
 *
 * So: one button for the model, one button for the effort, side by side, each doing one thing.
 *
 * The button is not rendered at all when the selected model publishes no levels, rather than shown
 * disabled. Most models publish none, and a permanently dead control next to the model name would be
 * worse than no control - there is nothing the reader could do about it.
 */
export function EffortSelect(props: {
  /**
   * Levels the current model accepts. Empty means this control does not apply.
   *
   * Structural rather than the nominal `ModelBehaviorOption`, because the composer already declares the
   * same shape without `description` and threading a stricter type up through it would be a change to
   * three files for no gain here.
   */
  options: Array<{ value: string | null; label: string; description?: string }>;
  value: string | null;
  /** The provider-family heading, e.g. "Extended thinking" / "Reasoning effort". */
  title?: string;
  label?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectable = props.options.filter((option) => option.value != null);
  if (selectable.length === 0) return null;

  const current = selectable.find((option) => option.value === props.value);
  const shown = props.label ?? current?.label ?? selectable[0]?.label ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              type="button"
              disabled={props.disabled}
              aria-label={props.title ?? t("effort.label")}
              className="flex h-9 max-h-9 items-center gap-1 rounded-md px-2 text-sm text-gray-10 transition-colors hover:bg-gray-3 hover:text-gray-12 disabled:pointer-events-none disabled:opacity-60"
            />
          }
        >
          <span className="max-w-28 truncate">{shown}</span>
          <ChevronDown className="h-3 w-3" />
        </TooltipTrigger>
        <TooltipContent>{props.title ?? t("effort.label")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="border-b border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          {props.title ?? t("effort.label")}
        </div>
        <div className="flex flex-col py-1">
          {selectable.map((option) => (
            <button
              key={option.value ?? "default"}
              type="button"
              onClick={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-foreground/5",
                option.value === props.value && "bg-foreground/5 font-medium",
              )}
            >
              <span className="text-foreground">{option.label}</span>
              {option.description ? (
                <span className="text-[11px] leading-4 text-muted-foreground">{option.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
