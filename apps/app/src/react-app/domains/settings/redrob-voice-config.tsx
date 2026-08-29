/** @jsxImportSource react */
import { useState } from "react";
import { CheckCircle2, Loader2, Mic2, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { registerExtensionConfig, type ExtensionConfigContext } from "./extension-registry";

export type RedrobWorkVoiceConfigProps = {
  busy: boolean;
  status: string | null;
  error: string | null;
  envKeyDetected: boolean;
  onSaveApiKey: (apiKey: string) => void | Promise<void>;
  onTestSession: () => void | Promise<void>;
};

const redrobVoiceConfigFactory = (ctx: ExtensionConfigContext) => (
  <RedrobWorkVoiceConfig
    busy={ctx.voiceExtension.busy}
    status={ctx.voiceExtension.status}
    error={ctx.voiceExtension.error}
    envKeyDetected={ctx.voiceExtension.envKeyDetected}
    onSaveApiKey={ctx.voiceExtension.onSaveApiKey}
    onTestSession={ctx.voiceExtension.onTestSession}
  />
);

registerExtensionConfig("redrob.voice.settings", redrobVoiceConfigFactory);
registerExtensionConfig("redrob-voice", redrobVoiceConfigFactory);

export function RedrobWorkVoiceConfig(props: RedrobWorkVoiceConfigProps) {
  const [apiKey, setApiKey] = useState("");
  const canSave = Boolean(apiKey.trim());

  return (
    <Card variant="outline" size="sm">
      <CardHeader>
        <CardTitle>{t("settings.voice_title")}</CardTitle>
        <CardDescription>{t("settings.voice_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.envKeyDetected ? (
          <Alert>
            <Mic2 />
            <AlertTitle>{t("settings.voice_env_key_detected_title")}</AlertTitle>
            <AlertDescription>{t("settings.voice_env_key_detected_desc")}</AlertDescription>
          </Alert>
        ) : null}

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="redrob-voice-api-key">{t("settings.voice_api_key_label")}</FieldLabel>
            <Input
              id="redrob-voice-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              placeholder={t("settings.voice_api_key_placeholder")}
            />
            <FieldDescription>{t("settings.voice_api_key_desc")}</FieldDescription>
          </Field>
        </FieldGroup>

        {props.status ? (
          <Alert>
            <CheckCircle2 />
            <AlertDescription>{props.status}</AlertDescription>
          </Alert>
        ) : null}
        {props.error ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertDescription>{props.error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap gap-2 border-t border-border justify-between">
        <Button onClick={() => void props.onSaveApiKey(apiKey)} disabled={props.busy || !canSave}>
          {props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
          {t("settings.voice_save_key")}
        </Button>
        <Button variant="outline" onClick={() => void props.onTestSession()} disabled={props.busy || !props.envKeyDetected}>
          {t("settings.voice_test_realtime")}
        </Button>
      </CardFooter>
    </Card>
  );
}
