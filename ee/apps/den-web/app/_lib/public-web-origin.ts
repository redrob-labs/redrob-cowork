import { readBaseUrlEnv } from "@redrob/types/url";
import { denUrls } from "@redrob-ee/utils";

export function readPublicWebOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    return denUrls(env).web;
  } catch {
    return readBaseUrlEnv(env, "DEN_WEB_PUBLIC_ORIGIN");
  }
}
