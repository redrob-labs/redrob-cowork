/** @jsxImportSource react */
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";
import {
  DESKTOP_NOTIFICATION_PREFERENCE_VALUES,
  isDesktopNotificationPreference,
  type DesktopNotificationPreference,
} from "@/react-app/kernel/desktop-notification-preferences";
import {
  LayoutSection,
  LayoutSectionDescription,
  LayoutSectionHeader,
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutSectionTitle,
  LayoutStack,
} from "../settings-layout";
import { DesktopIntegrationSection } from "../desktop-integration-section";

export type PreferencesViewProps = {
  busy: boolean;
  showThinking: boolean;
  onToggleShowThinking: () => void;
  autoCompactContext: boolean;
  autoCompactContextBusy: boolean;
  onToggleAutoCompactContext: () => void;
  compactThreshold: number;
  compactThresholdBusy: boolean;
  onCompactThresholdChange: (percent: number) => void;
  analyticsEnabled: boolean;
  onToggleAnalytics: () => void;
  desktopNotifications: DesktopNotificationPreference;
  onDesktopNotificationsChange: (value: DesktopNotificationPreference) => void;
  continuousEngineAvailable: boolean;
  continuousEngineEnabled: boolean;
  continuousEngineBusy: boolean;
  onToggleContinuousEngine: () => void;
  memoryEnabled: boolean;
  onToggleMemory: () => void;
};

function desktopNotificationPreferenceLabel(value: DesktopNotificationPreference) {
  switch (value) {
    case "important":
      return t("settings.desktop_notifications.important");
    case "all":
      return t("settings.desktop_notifications.all");
    case "off":
      return t("settings.desktop_notifications.off");
  }
}

export function PreferencesView(props: PreferencesViewProps) {
  const desktopNotificationItems = DESKTOP_NOTIFICATION_PREFERENCE_VALUES.map((value) => ({
    value,
    label: desktopNotificationPreferenceLabel(value),
  }));

  return (
    <LayoutStack>
      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.model_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.model_section_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        {/* Show reasoning */}
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.show_model_reasoning")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.show_model_reasoning_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                aria-label={t("settings.show_model_reasoning")}
                checked={props.showThinking}
                disabled={props.busy}
                onCheckedChange={props.onToggleShowThinking}
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>

        {/* Auto context compaction */}
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.auto_compact")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.auto_compact_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                aria-label={t("settings.auto_compact")}
                checked={props.autoCompactContext}
                disabled={props.busy || props.autoCompactContextBusy}
                onCheckedChange={props.onToggleAutoCompactContext}
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>

        {/*
          When compaction fires.

          Only meaningful while auto-compaction is on, so it is disabled rather than hidden when the switch
          above is off - hiding it would make the toggle look like the whole of the feature, which is how
          the engine and the app came to disagree about the default in the first place.

          The tooltip carries the explanation because the number alone does not have one: "70%" tells the
          user nothing about what is summarised, what is kept, or why a lower number is not simply safer.
        */}
        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>
              <Tooltip>
                {/* Base UI takes a `render` element, not Radix's `asChild`. */}
                <TooltipTrigger
                  render={
                    <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4" />
                  }
                >
                  {t("settings.compact_threshold")}
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t("settings.compact_threshold_tooltip")}</TooltipContent>
              </Tooltip>
            </LayoutSectionItemTitle>
            <LayoutSectionItemDescription>
              {t("settings.compact_threshold_desc", { percent: String(props.compactThreshold) })}
            </LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <div className="flex items-center gap-3">
                <input
                  aria-label={t("settings.compact_threshold")}
                  className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-dls-border accent-dls-accent disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={props.busy || props.compactThresholdBusy || !props.autoCompactContext}
                  max={95}
                  min={40}
                  onChange={(event) => props.onCompactThresholdChange(Number(event.target.value))}
                  step={5}
                  type="range"
                  value={props.compactThreshold}
                />
                {/* Tabular so the row does not shift width as the number changes under the drag. */}
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                  {props.compactThreshold}%
                </span>
              </div>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.desktop_notifications.title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.desktop_notifications.section_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.desktop_notifications.mode")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.desktop_notifications.mode_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <div className="w-44 max-w-full">
                <Select
                  value={props.desktopNotifications}
                  items={desktopNotificationItems}
                  onValueChange={(value) => {
                    if (isDesktopNotificationPreference(value)) {
                      props.onDesktopNotificationsChange(value);
                    }
                  }}
                  disabled={props.busy}
                >
                  <SelectTrigger className="w-full" aria-label={t("settings.desktop_notifications.mode")}>
                    <SelectValue placeholder={t("settings.desktop_notifications.off")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {DESKTOP_NOTIFICATION_PREFERENCE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {desktopNotificationPreferenceLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      </LayoutSection>

      <DesktopIntegrationSection />

      {props.continuousEngineAvailable ? (
        <LayoutSection>
          <LayoutSectionHeader>
            <LayoutSectionTitle>{t("settings.engine_rollover_title")}</LayoutSectionTitle>
            <LayoutSectionDescription>{t("settings.engine_rollover_section_desc")}</LayoutSectionDescription>
          </LayoutSectionHeader>

          <LayoutSectionItem>
            <LayoutSectionItemHeader>
              <LayoutSectionItemTitle>{t("settings.engine_rollover_toggle")}</LayoutSectionItemTitle>
              <LayoutSectionItemDescription>{t("settings.engine_rollover_toggle_desc")}</LayoutSectionItemDescription>
              <LayoutSectionItemHeaderActions>
                <Switch
                  aria-label={t("settings.engine_rollover_toggle")}
                  checked={props.continuousEngineEnabled}
                  disabled={props.busy || props.continuousEngineBusy}
                  onCheckedChange={props.onToggleContinuousEngine}
                />
              </LayoutSectionItemHeaderActions>
            </LayoutSectionItemHeader>
          </LayoutSectionItem>
        </LayoutSection>
      ) : null}

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("settings.privacy_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("settings.privacy_section_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("settings.analytics_toggle")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("settings.analytics_toggle_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                aria-label={t("settings.analytics_toggle")}
                checked={props.analyticsEnabled}
                disabled={props.busy}
                onCheckedChange={props.onToggleAnalytics}
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      </LayoutSection>

      <LayoutSection>
        <LayoutSectionHeader>
          <LayoutSectionTitle>{t("memory.preferences_title")}</LayoutSectionTitle>
          <LayoutSectionDescription>{t("memory.preferences_section_desc")}</LayoutSectionDescription>
        </LayoutSectionHeader>

        <LayoutSectionItem>
          <LayoutSectionItemHeader>
            <LayoutSectionItemTitle>{t("memory.preferences_toggle")}</LayoutSectionItemTitle>
            <LayoutSectionItemDescription>{t("memory.preferences_toggle_desc")}</LayoutSectionItemDescription>
            <LayoutSectionItemHeaderActions>
              <Switch
                aria-label={t("memory.preferences_toggle")}
                checked={props.memoryEnabled}
                disabled={props.busy}
                onCheckedChange={props.onToggleMemory}
              />
            </LayoutSectionItemHeaderActions>
          </LayoutSectionItemHeader>
        </LayoutSectionItem>
      </LayoutSection>

    </LayoutStack>
  );
}
