/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { Button as DsButton, IconButton as DsIconButton } from "@redrob-labs/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { Button, buttonVariants } from "../../src/components/ui/button";
import { parity } from "../helpers/ds-parity";

/**
 * The app's Button renders the design system's Button and IconButton: every
 * variant and size the app speaks is compared, markup for markup, against the
 * package's own component given the design-system props it maps to.
 */
const VARIANTS = [
  ["default", "primary"],
  ["outline", "secondary"],
  ["secondary", "secondary"],
  ["ghost", "ghost"],
  ["destructive", "danger"],
] as const;

const SIZES = [
  ["xs", "sm"],
  ["sm", "sm"],
  ["default", "md"],
  ["lg", "lg"],
] as const;

const ICON_SIZES = [
  ["icon-xs", "sm"],
  ["icon-sm", "sm"],
  ["icon", "md"],
  ["icon-lg", "lg"],
] as const;

const Glyph = () => <svg data-glyph="" />;

describe("Button renders the design system's Button", () => {
  for (const [variant, dsVariant] of VARIANTS) {
    for (const [size, dsSize] of SIZES) {
      test(`${variant} / ${size} is rr-btn--${dsVariant} rr-btn--${dsSize}`, () => {
        const { app, designSystem } = parity(
          <Button variant={variant} size={size}>
            Save role
          </Button>,
          <DsButton variant={dsVariant} size={dsSize}>
            Save role
          </DsButton>,
        );
        expect(app).toEqual(designSystem);
      });
    }
  }

  test("a leading and a trailing icon take the design system's icon slots", () => {
    const { app, designSystem } = parity(
      <Button>
        <Glyph data-icon="inline-start" />
        Continue
        <Glyph data-icon="inline-end" />
      </Button>,
      <DsButton iconLeft={<Glyph />} iconRight={<Glyph />}>
        Continue
      </DsButton>,
    );
    expect(app).toEqual(designSystem);
  });

  test("loading keeps the label, shows the spinner and is busy", () => {
    const { app, designSystem } = parity(
      <Button loading iconLeft={<Glyph />}>
        Saving
      </Button>,
      <DsButton loading iconLeft={<Glyph />}>
        Saving
      </DsButton>,
    );
    expect(app).toEqual(designSystem);
  });

  test("pill, emphasis and full width are the design system's modifiers", () => {
    const { app, designSystem } = parity(
      <Button shape="pill" emphasis fullWidth size="lg">
        Start
      </Button>,
      <DsButton shape="pill" emphasis fullWidth size="lg">
        Start
      </DsButton>,
    );
    expect(app).toEqual(designSystem);
  });

  test("disabled is the native attribute, as the design system's", () => {
    const { app, designSystem } = parity(
      <Button disabled>Delete</Button>,
      <DsButton disabled>Delete</DsButton>,
    );
    expect(app).toEqual(designSystem);
  });
});

describe("an icon-only Button renders the design system's IconButton", () => {
  for (const [variant, dsVariant] of [
    ["default", "primary"],
    ["outline", "secondary"],
    ["ghost", "ghost"],
  ] as const) {
    for (const [size, dsSize] of ICON_SIZES) {
      test(`${variant} / ${size} is rr-iconbtn--${dsVariant} rr-iconbtn--${dsSize}, named by its label`, () => {
        const { app, designSystem } = parity(
          <Button variant={variant} size={size} label="Close">
            <Glyph />
          </Button>,
          <DsIconButton variant={dsVariant} size={dsSize} label="Close">
            <Glyph />
          </DsIconButton>,
        );
        expect(app).toEqual(designSystem);
      });
    }
  }

  test("a round icon button is the design system's round modifier", () => {
    const { app, designSystem } = parity(
      <Button size="icon" shape="pill" label="More">
        <Glyph />
      </Button>,
      <DsIconButton size="md" round label="More">
        <Glyph />
      </DsIconButton>,
    );
    expect(app).toEqual(designSystem);
  });
});

describe("Button keeps the app's own contract", () => {
  test("a call site's utilities stay on the element, after the design system's classes", () => {
    const html = renderToStaticMarkup(
      <Button variant="outline" className="w-full justify-start">
        Open
      </Button>,
    );
    expect(html).toContain("rr-btn rr-btn--secondary rr-btn--md");
    expect(html).toContain("w-full justify-start");
    expect(html).toContain('data-slot="button"');
  });

  test("a link is the ghost button's ink without its box", () => {
    expect(buttonVariants({ variant: "link" })).toContain("rr-btn--ghost");
    expect(buttonVariants({ variant: "link" })).toContain("px-0");
  });

  test("an icon button with no label keeps a name the call site gave it", () => {
    const html = renderToStaticMarkup(
      <Button size="icon-sm" aria-label="Copy">
        <Glyph />
      </Button>,
    );
    expect(html).toContain('aria-label="Copy"');
    // No variant on an icon size is the design system's IconButton default: ghost.
    expect(html).toContain("rr-iconbtn rr-iconbtn--ghost rr-iconbtn--sm");
  });

  test("an explicit default variant on an icon size is still the primary icon button", () => {
    expect(buttonVariants({ variant: "default", size: "icon" })).toContain("rr-iconbtn--primary");
    expect(buttonVariants({ size: "icon" })).toContain("rr-iconbtn--ghost");
    expect(buttonVariants({})).toContain("rr-btn--primary");
  });
});
