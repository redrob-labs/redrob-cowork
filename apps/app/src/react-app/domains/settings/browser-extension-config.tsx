/** @jsxImportSource react */
import { MonitorSmartphone } from "lucide-react";

import { t } from "@/i18n";
import { surfaceCardClass } from "../workspace/modal-styles";
import { registerExtensionConfig } from "./extension-registry";

const redrobBrowserConfigFactory = () => <RedrobWorkBrowserConfig />;

registerExtensionConfig("redrob.browser.settings", redrobBrowserConfigFactory);
registerExtensionConfig("redrob-browser", redrobBrowserConfigFactory);

function RedrobWorkBrowserConfig() {
  return (
    <div className={`${surfaceCardClass} space-y-3 p-4`}>
      <div className="flex items-start gap-3">
        <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-blue-11" />
        <div className="space-y-1 text-[13px] leading-relaxed text-dls-secondary">
          <div className="font-medium text-dls-text">{t("settings.browser_ready_title")}</div>
          <div>{t("settings.browser_ready_desc")}</div>
        </div>
      </div>
    </div>
  );
}
