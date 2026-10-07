/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import {
  Checkbox as DsCheckbox,
  Input as DsInput,
  Radio as DsRadio,
  Select as DsSelect,
  Switch as DsSwitch,
  Textarea as DsTextarea,
} from "@redrob-labs/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { Checkbox } from "../../src/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../src/components/ui/field";
import { Input } from "../../src/components/ui/input";
import { InputGroup, InputGroupInput } from "../../src/components/ui/input-group";
import { Label } from "../../src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../src/components/ui/radio-group";
import { Select, SelectTrigger, SelectValue } from "../../src/components/ui/select";
import { Switch } from "../../src/components/ui/switch";
import { Textarea } from "../../src/components/ui/textarea";
import { TextInput } from "../../src/react-app/design-system/text-input";
import { type ParityNode, parityTree } from "../helpers/ds-parity";

/** The nodes of the first element with `tag`, open to close (or the one node, if void). */
function element(nodes: ParityNode[], tag: string): ParityNode[] {
  const start = nodes.findIndex((node) => "tag" in node && node.tag === tag);
  expect(start, `no <${tag}>`).toBeGreaterThan(-1);
  const end = nodes.findIndex((node, index) => index > start && "tag" in node && node.tag === `/${tag}`);
  return nodes.slice(start, end === -1 ? start + 1 : end + 1);
}

/** Every `rr-*` class a rendering uses. */
function rrClasses(html: string): Set<string> {
  return new Set(parityTree(html).flatMap((node) => ("rr" in node ? node.rr : [])));
}

const markup = renderToStaticMarkup;

describe("text controls render the design system's control", () => {
  for (const size of ["sm", "md", "lg"] as const) {
    test(`Input at ${size} is the design system's rr-control--${size}`, () => {
      const app = element(parityTree(markup(<Input controlSize={size} placeholder="Name" />)), "input");
      const designSystem = element(parityTree(markup(<DsInput size={size} placeholder="Name" />)), "input");
      expect(app).toEqual(designSystem);
    });
  }

  test("an invalid Input carries the same aria-invalid the design system styles", () => {
    const app = element(parityTree(markup(<Input aria-invalid="true" />)), "input");
    const designSystem = element(parityTree(markup(<DsInput invalid />)), "input");
    expect(app).toEqual(designSystem);
  });

  test("Textarea is the design system's rr-control rr-textarea", () => {
    const app = element(parityTree(markup(<Textarea placeholder="Notes" />)), "textarea");
    const designSystem = element(parityTree(markup(<DsTextarea placeholder="Notes" />)), "textarea");
    expect(app).toEqual(designSystem);
  });

  test("the input group is one control box, and the input inside it is not a second one", () => {
    const html = markup(
      <InputGroup>
        <InputGroupInput placeholder="Search" />
      </InputGroup>,
    );
    const [group] = parityTree(html);
    expect("rr" in group && group.rr).toEqual(["rr-control"]);
    // The inner input keeps the class for its type and focus treatment but loses its box.
    expect(html).toMatch(/<input[^>]*class="[^"]*rr-control[^"]*border-0[^"]*"/);
  });
});

describe("the field frame is the design system's", () => {
  test("label, control, hint and error use the classes the design system's Input renders", () => {
    const app = rrClasses(
      markup(
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" />
          <FieldDescription>Shown on your profile.</FieldDescription>
          <FieldError>Required</FieldError>
        </Field>,
      ),
    );
    const withHint = rrClasses(markup(<DsInput id="name" label="Name" hint="Shown on your profile." />));
    const withError = rrClasses(markup(<DsInput id="name" label="Name" error="Required" />));
    expect([...app].sort()).toEqual([...new Set([...withHint, ...withError])].sort());
  });

  test("a bare Label is the design system's field label", () => {
    expect([...rrClasses(markup(<Label htmlFor="x">Theme</Label>))]).toEqual(["rr-field__label"]);
  });

  test("TextInput is the design system's Input, with the label and hint wired to the control", () => {
    const html = markup(<TextInput id="key" label="API key" hint="Starts with rr_" type="password" />);
    expect(html).toBe(markup(<DsInput id="key" label="API key" hint="Starts with rr_" type="password" />));
    expect(html).toContain('for="key"');
    expect(html).toContain('aria-describedby="key-msg"');
    expect(html).toContain('id="key-msg"');
  });
});

/**
 * Checkbox, Switch and Radio keep Base UI for state, which makes the box itself
 * the focusable element (`role="checkbox"` and so on) where the design system
 * puts a visually hidden native input before it. The tree cannot be the same,
 * so the contract checked is the part of the design system's rendering the app
 * draws: the box, mark, track, thumb and dot classes, and the role and state a
 * screen reader reads.
 */
describe("choice controls draw the design system's box, track and dot", () => {
  test("Checkbox is the design system's box and mark, and announces its state", () => {
    const app = rrClasses(markup(<Checkbox defaultChecked />));
    const designSystem = rrClasses(markup(<DsCheckbox defaultChecked label="x" />));
    expect([...app].sort()).toEqual(["rr-choice__box", "rr-choice__mark"]);
    for (const name of app) expect(designSystem.has(name), name).toBe(true);
    const html = markup(<Checkbox defaultChecked />);
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
  });

  test("Switch is the design system's track and thumb, and announces its state", () => {
    const app = rrClasses(markup(<Switch defaultChecked />));
    const designSystem = rrClasses(markup(<DsSwitch defaultChecked label="x" />));
    expect([...app].sort()).toEqual(["rr-switch__thumb", "rr-switch__track"]);
    for (const name of app) expect(designSystem.has(name), name).toBe(true);
    const html = markup(<Switch defaultChecked />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });

  test("a small Switch keeps the design system's small travel", () => {
    expect(markup(<Switch size="sm" />)).toContain("data-checked:translate-x-3");
    expect(markup(<Switch />)).toContain("data-checked:translate-x-4");
  });

  test("a radio is the design system's round box and dot", () => {
    const app = rrClasses(
      markup(
        <RadioGroup defaultValue="a">
          <RadioGroupItem value="a" />
        </RadioGroup>,
      ),
    );
    const designSystem = rrClasses(markup(<DsRadio defaultChecked label="x" />));
    expect([...app].sort()).toEqual(["rr-choice__box", "rr-choice__box--radio", "rr-choice__dot"]);
    for (const name of app) expect(designSystem.has(name), name).toBe(true);
  });
});

describe("the Select trigger is the design system's", () => {
  test("its classes are the design system's Select button and value", () => {
    const app = rrClasses(
      markup(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
        </Select>,
      ),
    );
    const designSystem = rrClasses(markup(<DsSelect placeholder="Pick one" options={["a"]} />));
    expect([...app].sort()).toEqual([
      "rr-control",
      "rr-control--md",
      "rr-select",
      "rr-select__button",
      "rr-select__value",
    ]);
    for (const name of app) expect(designSystem.has(name), name).toBe(true);
  });

  test("a small trigger is the design system's small control", () => {
    const html = markup(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(html).toContain("rr-control--sm");
  });
});
