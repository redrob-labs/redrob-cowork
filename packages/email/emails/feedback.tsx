import { FeedbackEmail, type FeedbackEmailProps } from "../src/templates/feedback"

export default function FeedbackPreview(props: FeedbackEmailProps) {
  return <FeedbackEmail {...props} />
}

FeedbackPreview.PreviewProps = {
  name: "Jane Doe",
  email: "jane@example.com",
  message: "I tried to connect a worker from Settings, but the connection stayed pending after the token was accepted.",
  source: "redrob-app",
  entrypoint: "settings",
  deployment: "desktop",
  appVersion: "0.13.5",
  redrobServerVersion: "0.13.5",
  redrobCodeVersion: "0.0.1",
  osName: "macOS",
  osVersion: "15.4",
  platform: "MacIntel",
  diagnosticsSummary: "Source: redrob-app\nEntrypoint: settings\nDeployment: desktop\nApp version: 0.13.5\nOS: macOS 15.4\nPlatform: MacIntel",
  submittedAt: "2026-05-11T18:30:00.000Z",
} satisfies FeedbackEmailProps
