/** @jsxImportSource react */
import { Input, type InputProps } from "@redrob-labs/ui";

/**
 * One line of text with its label, hint and error: the design system's Input,
 * rendered by the design system itself. It owns no focus or positioning
 * behaviour, so there is nothing for Base UI to add; the label is wired to the
 * control with `htmlFor` and the hint or error with `aria-describedby`.
 */
export type TextInputProps = InputProps;

export function TextInput(props: TextInputProps) {
  return <Input {...props} />;
}
