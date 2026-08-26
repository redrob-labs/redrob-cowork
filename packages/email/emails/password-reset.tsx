import { PasswordResetEmail, type PasswordResetEmailProps } from "../src/templates/password-reset"

export default function PasswordResetPreview(props: PasswordResetEmailProps) {
  return <PasswordResetEmail {...props} />
}

PasswordResetPreview.PreviewProps = {
  resetLink: "https://app.redrob.io/api/auth/reset-password/example-token?callbackURL=https%3A%2F%2Fapp.redrob.io%2Freset-password",
} satisfies PasswordResetEmailProps
