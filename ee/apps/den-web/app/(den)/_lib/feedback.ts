export const REDROB_FEEDBACK_URL = "https://redrob.io/feedback";

export function buildDenFeedbackUrl(options?: {
  pathname?: string;
  orgSlug?: string | null;
  topic?: string;
}) {
  const params = new URLSearchParams({
    source: "redrob-web-app",
    deployment: "web",
    entrypoint: options?.pathname ?? "dashboard"
  });

  if (options?.orgSlug) {
    params.set("org", options.orgSlug);
  }

  if (options?.topic) {
    params.set("topic", options.topic);
  }

  return `${REDROB_FEEDBACK_URL}?${params.toString()}`;
}
