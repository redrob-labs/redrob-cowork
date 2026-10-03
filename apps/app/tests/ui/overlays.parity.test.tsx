/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { Drawer as DsDrawer, Modal as DsModal, Tooltip as DsTooltip } from "@redrob-labs/ui";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { buttonVariants } from "../../src/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../src/components/ui/dialog";
import {
  menuItemClassName,
  menuItemDangerClassName,
  menuSeparatorClassName,
  menuShortcutClassName,
  menuSurfaceClassName,
} from "../../src/components/ui/menu-surface";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../../src/components/ui/sheet";
import { parityTree } from "../helpers/ds-parity";

/**
 * Overlays keep Base UI for focus trapping, portals, positioning and dismissal,
 * and a portalled popup renders nothing under static rendering. So the contract
 * checked here is the design system's class vocabulary: the parts a static
 * render can reach are rendered, the portalled panel and scrim are read from the
 * primitive's own source, and together they must cover every class the design
 * system's own Modal, Drawer and Tooltip render.
 */
const APP_ROOT = join(import.meta.dir, "..", "..");
const appRequire = createRequire(join(APP_ROOT, "package.json"));
const DS_CSS = readFileSync(appRequire.resolve("@redrob-labs/ui/styles.css"), "utf8");

const source = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const rrIn = (text: string) => new Set(text.match(/\brr-[\w-]+/g) ?? []);
const rrRendered = (html: string) => new Set(parityTree(html).flatMap((node) => ("rr" in node ? node.rr : [])));
/**
 * The close control the primitives render: a small ghost icon button, whose
 * glyph Button wraps in the design system's `rr-btn__icon` slot (checked in
 * button.parity.test.tsx).
 */
const CLOSE_CONTROL = new Set([...rrIn(buttonVariants({ variant: "ghost", size: "icon-sm" })), "rr-btn__icon"]);

function covers(app: Set<string>, designSystem: Set<string>): string[] {
  return [...designSystem].filter((name) => !app.has(name)).sort();
}

describe("Dialog is the design system's Modal", () => {
  const rendered = rrRendered(
    renderToStaticMarkup(
      <Dialog open>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Give it a name.</DialogDescription>
        </DialogHeader>
        <DialogFooter>Save</DialogFooter>
      </Dialog>,
    ),
  );

  test("head, title, body text and footer render the Modal's parts", () => {
    expect([...rendered].sort()).toEqual(["rr-modal__body", "rr-modal__footer", "rr-modal__head", "rr-modal__title"]);
  });

  test("with the scrim, panel and close control it covers every class the Modal renders", () => {
    const designSystem = rrRendered(
      renderToStaticMarkup(
        <DsModal open title="Rename" footer="Save" onClose={() => undefined}>
          Give it a name.
        </DsModal>,
      ),
    );
    const app = new Set([...rendered, ...rrIn(source("src/components/ui/dialog.tsx")), ...CLOSE_CONTROL]);
    expect(covers(app, designSystem)).toEqual([]);
  });

  test("AlertDialog draws the same Modal", () => {
    const designSystem = rrRendered(renderToStaticMarkup(<DsModal open title="Delete?" footer="Delete" />));
    expect(covers(rrIn(source("src/components/ui/alert-dialog.tsx")), designSystem)).toEqual([]);
  });

  test("the command palette is a Modal panel over the Modal scrim", () => {
    const palette = rrIn(source("src/components/ui/command.tsx"));
    for (const name of ["rr-modal-scrim", "rr-modal", "rr-modal__footer"]) expect(palette.has(name), name).toBe(true);
  });
});

describe("Sheet is the design system's Drawer", () => {
  const rendered = rrRendered(
    renderToStaticMarkup(
      <Sheet open>
        <SheetHeader>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>What this panel is for.</SheetDescription>
        </SheetHeader>
        <SheetFooter>Done</SheetFooter>
      </Sheet>,
    ),
  );

  test("head, title, description and footer render the Drawer's parts", () => {
    expect([...rendered].sort()).toEqual(["rr-drawer__desc", "rr-drawer__footer", "rr-drawer__head", "rr-drawer__title"]);
  });

  test("with the scrim, panel, side and close control it covers the Drawer's classes", () => {
    const designSystem = rrRendered(
      renderToStaticMarkup(
        <DsDrawer open side="right" title="Details" description="What this panel is for." footer="Done" onClose={() => undefined}>
          Body
        </DsDrawer>,
      ),
    );
    // The Drawer's body and title wrapper are layout the app's sheets do themselves.
    designSystem.delete("rr-drawer__body");
    designSystem.delete("rr-drawer__titles");
    const sheet = source("src/components/ui/sheet.tsx");
    // `rr-drawer--${side}` is built from the side prop.
    expect(sheet).toContain("`rr-drawer--${side}`");
    const app = new Set([...rendered, ...rrIn(sheet), "rr-drawer--right", ...CLOSE_CONTROL]);
    expect(covers(app, designSystem)).toEqual([]);
  });
});

describe("close controls are named in the reader's language", () => {
  for (const rel of ["src/components/ui/dialog.tsx", "src/components/ui/sheet.tsx"]) {
    test(`${rel} names its close control with t("common.close")`, () => {
      const text = source(rel);
      expect(text).toContain('label={t("common.close")}');
      expect(text).not.toMatch(/>\s*Close\s*</);
    });
  }
});

describe("Tooltip is the design system's bubble", () => {
  test("its popup carries the bubble class and the tooltip role", () => {
    const text = source("src/components/ui/tooltip.tsx");
    expect(text).toContain('"rr-tooltip__bubble');
    expect(text).toContain('role="tooltip"');
    // Base UI positions it; the design system's wrapper and placement modifiers
    // are for its own absolute layout, so only the bubble is shared.
    const designSystem = rrRendered(renderToStaticMarkup(<DsTooltip content="Copy">x</DsTooltip>));
    expect(designSystem.has("rr-tooltip__bubble")).toBe(true);
  });
});

describe("every menu draws the design system's Menu", () => {
  test("the shared surface uses the Menu's panel, row, danger row, separator and shortcut", () => {
    expect(menuSurfaceClassName).toContain("rr-menu__list");
    expect(menuItemClassName).toContain("rr-menu__item");
    expect(menuItemDangerClassName).toContain("rr-menu__item--danger");
    expect(menuSeparatorClassName).toBe("rr-menu__sep");
    expect(menuShortcutClassName).toContain("rr-menu__shortcut");
    for (const name of ["rr-menu__list", "rr-menu__item", "rr-menu__item--danger", "rr-menu__sep", "rr-menu__shortcut"]) {
      expect(DS_CSS, name).toContain(`.${name}`);
    }
    // Floating material, which the design system backs with a solid surface where
    // transparency is reduced (index.css).
    expect(menuSurfaceClassName).toContain("bg-material");
  });

  for (const rel of [
    "src/components/ui/dropdown-menu.tsx",
    "src/components/ui/context-menu.tsx",
    "src/components/ui/select.tsx",
    "src/overlay/context-menu.tsx",
  ]) {
    test(`${rel} takes the shared surface and follows the page theme`, () => {
      const text = source(rel);
      expect(text).toContain("menuSurfaceClassName");
      expect(text).not.toContain('data-theme="dark"');
      expect(text).not.toContain("bg-popover/70");
    });
  }
});
