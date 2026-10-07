/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import {
  Alert as DsAlert,
  EmptyState as DsEmptyState,
  Loader as DsLoader,
  Progress as DsProgress,
  Skeleton as DsSkeleton,
  Toast as DsToast,
} from "@redrob-labs/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { Alert, AlertDescription, AlertTitle } from "../../src/components/ui/alert";
import { DotMatrixLoader } from "../../src/components/ui/dot-matrix-loader";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../src/components/ui/empty";
import { Progress } from "../../src/components/ui/progress";
import { Skeleton } from "../../src/components/ui/skeleton";
import { ToastCard } from "../../src/components/ui/sonner";
// The close label is whatever the active locale says: other suites in the same
// run switch the locale, so the expectation reads it rather than assuming English.
import { t } from "../../src/i18n";
import { parityTree } from "../helpers/ds-parity";

const markup = renderToStaticMarkup;
const rr = (html: string) => new Set(parityTree(html).flatMap((node) => ("rr" in node ? node.rr : [])));
const sorted = (set: Set<string>) => [...set].sort();
const missingFrom = (app: Set<string>, designSystem: Set<string>) => [...app].filter((name) => !designSystem.has(name));

describe("Alert is the design system's Alert", () => {
  for (const [variant, tone, role] of [
    ["default", "info", "status"],
    ["info", "info", "status"],
    ["success", "success", "status"],
    ["warning", "warning", "status"],
    ["destructive", "danger", "alert"],
  ] as const) {
    test(`${variant} is rr-alert--${tone} with role="${role}"`, () => {
      const app = markup(
        <Alert variant={variant}>
          <AlertTitle>Update ready</AlertTitle>
          <AlertDescription>Restart to finish.</AlertDescription>
        </Alert>,
      );
      const designSystem = markup(
        <DsAlert tone={tone} title="Update ready">
          Restart to finish.
        </DsAlert>,
      );
      // The tone, title and text classes are the design system's; the app lays
      // its own icon out in a grid, so the icon span and body wrapper are not used.
      expect(sorted(rr(app))).toEqual(sorted(new Set(["rr-alert", `rr-alert--${tone}`, "rr-alert__title", "rr-alert__text"])));
      expect(missingFrom(rr(app), rr(designSystem))).toEqual([]);
      // Danger interrupts a screen reader; everything else waits its turn, as the design system's does.
      expect(app).toContain(`role="${role}"`);
      expect(designSystem).toContain(`role="${role}"`);
    });
  }
});

describe("toasts are the design system's Toast", () => {
  for (const [type, tone] of [
    ["success", "success"],
    ["info", "info"],
    ["warning", "warning"],
    ["error", "danger"],
    ["default", undefined],
  ] as const) {
    test(`a ${type} toast renders exactly the design system's Toast`, () => {
      const app = markup(<ToastCard id="t" type={type} title="Saved" description="Your changes are in." />);
      const designSystem = markup(
        <DsToast tone={tone} title="Saved" closeLabel={t("common.dismiss")} onClose={() => undefined}>
          Your changes are in.
        </DsToast>,
      );
      expect(parityTree(app)).toEqual(parityTree(designSystem));
      expect(app).toContain('aria-live="polite"');
    });
  }

  test("an action sits in the design system's action slot", () => {
    const html = markup(
      <ToastCard id="t" type="info" title="Deleted" action={{ label: "Undo", onClick: () => undefined }} />,
    );
    expect(html).toContain('class="rr-toast__action"');
    expect(html).toContain("rr-btn rr-btn--primary rr-btn--sm");
  });
});

describe("Skeleton, Empty, Loader and Progress draw the design system's", () => {
  test("Skeleton is the design system's rect block, hidden from assistive technology", () => {
    const app = markup(<Skeleton className="h-16 w-full" />);
    const designSystem = markup(<DsSkeleton variant="rect" />);
    expect(sorted(rr(app))).toEqual(sorted(rr(designSystem)));
    expect(app).toContain('aria-hidden="true"');
    expect(sorted(rr(markup(<Skeleton variant="text" />)))).toEqual(sorted(rr(markup(<DsSkeleton variant="text" />))));
  });

  test("an empty state uses the design system's frame, icon well, title, description and actions", () => {
    const app = markup(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <svg />
          </EmptyMedia>
          <EmptyTitle>No memories yet</EmptyTitle>
          <EmptyDescription>Things you ask it to remember appear here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <button type="button">Add one</button>
        </EmptyContent>
      </Empty>,
    );
    const designSystem = markup(
      <DsEmptyState
        icon={<svg />}
        title="No memories yet"
        description="Things you ask it to remember appear here."
        action={<button type="button">Add one</button>}
      />,
    );
    expect(sorted(rr(app))).toEqual(sorted(rr(designSystem)));
  });

  test("the running mark is the design system's small Loader, without a live region", () => {
    const app = markup(<DotMatrixLoader label="Running" />);
    const designSystem = markup(<DsLoader size="sm" label="Running" live={false} />);
    expect(sorted(rr(app))).toEqual(sorted(rr(designSystem)));
    expect(app).toContain('role="status"');
    expect(app).not.toContain("aria-live");
    expect(app).toContain('<span class="rr-loader__sr">Running</span>');
  });

  test("Progress is the design system's track and bar, with the progressbar role", () => {
    const app = markup(<Progress value={40} />);
    const designSystem = markup(<DsProgress value={40} ariaLabel="Downloading" />);
    expect(sorted(rr(app))).toEqual(sorted(rr(designSystem)));
    expect(app).toContain('role="progressbar"');
    expect(app).toContain('aria-valuenow="40"');
  });
});
