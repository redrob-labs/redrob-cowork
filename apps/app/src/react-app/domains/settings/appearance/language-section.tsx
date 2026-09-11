/** @jsxImportSource react */
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_OPTIONS, localizedLanguageName, t } from "@/i18n";
import type { AppearanceViewProps } from "../pages/appearance-view";
import {
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
} from "../settings-layout";

interface LanguageSectionProps extends Pick<AppearanceViewProps, "busy" | "language" | "setLanguage"> {}

export function LanguageSection(props: LanguageSectionProps) {
  return (
    <LayoutSectionItem>
      <LayoutSectionItemHeader>
        <LayoutSectionItemTitle>{t("settings.language")}</LayoutSectionItemTitle>
        <LayoutSectionItemDescription>{t("settings.language.description")}</LayoutSectionItemDescription>

        <LayoutSectionItemHeaderActions>
          <div className="w-64 max-w-full">
            <Select
              value={props.language}
              onValueChange={(value) => {
                if (value) props.setLanguage(value);
              }}
              disabled={props.busy}
            >
              <SelectTrigger className="w-full" aria-label={t("settings.language")}>
                {/*
                  Explicit children. Left childless, Base UI resolves the selected
                  code against `items` and paints `LANGUAGE_OPTIONS[].label` -- the
                  ENGLISH name -- so a Korean user saw "Korean", and the raw code
                  "ko" wherever that lookup was unavailable. `items` is dropped for
                  the same reason: nothing should render `label`.
                */}
                <SelectValue placeholder={t("settings.language")}>
                  {localizedLanguageName(props.language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.nativeName === localizedLanguageName(option.value)
                        ? option.nativeName
                        : `${option.nativeName} · ${localizedLanguageName(option.value)}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </LayoutSectionItemHeaderActions>
      </LayoutSectionItemHeader>
    </LayoutSectionItem>
  );
}
