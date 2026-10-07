import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { hasNativeBrowserOccluder } from "../src/react-app/domains/session/panel/utils";
import {
  DeskDialog,
  handleDialogKey,
  rememberFocus,
  trapTabTarget,
} from "../src/react-app/desk/shell/desk-dialog";

type Item = { name: string; focus(): void };

function items(names: string[], focused: string[]): Item[] {
  return names.map((name) => ({ name, focus: () => focused.push(name) }));
}

function key(name: string, shiftKey = false) {
  const seen: string[] = [];
  return {
    seen,
    event: {
      key: name,
      shiftKey,
      preventDefault: () => seen.push("prevent"),
      stopPropagation: () => seen.push("stop"),
    },
  };
}

describe("focus trap", () => {
  const [close, send, cancel] = items(["close", "send", "cancel"], []);

  test("Tab from the last element wraps to the first, Shift+Tab from the first to the last", () => {
    const list = [close, send, cancel];
    expect(trapTabTarget(list, cancel, false)).toBe(close);
    expect(trapTabTarget(list, close, true)).toBe(cancel);
  });

  test("Tab in the middle is left to the browser", () => {
    const list = [close, send, cancel];
    expect(trapTabTarget(list, send, false)).toBeNull();
    expect(trapTabTarget(list, send, true)).toBeNull();
    expect(trapTabTarget(list, close, false)).toBeNull();
  });

  test("focus outside the dialog is brought back in", () => {
    const list = [close, send, cancel];
    expect(trapTabTarget(list, null, false)).toBe(close);
    expect(trapTabTarget(list, { other: true }, true)).toBe(cancel);
    expect(trapTabTarget([], null, false)).toBeNull();
  });

  test("the key handler moves focus and stops the browser only when it wraps", () => {
    const focused: string[] = [];
    const list = items(["a", "b"], focused);
    const wrap = key("Tab");
    handleDialogKey(wrap.event, { focusables: list, active: list[1], onClose: () => {} });
    expect(focused).toEqual(["a"]);
    expect(wrap.seen).toEqual(["prevent"]);

    const back = key("Tab", true);
    handleDialogKey(back.event, { focusables: list, active: list[0], onClose: () => {} });
    expect(focused).toEqual(["a", "b"]);

    const middle = key("Tab", true);
    handleDialogKey(middle.event, { focusables: list, active: list[1], onClose: () => {} });
    expect(middle.seen).toEqual([]);
    expect(focused).toEqual(["a", "b"]);

    const nothing = key("Tab");
    handleDialogKey(nothing.event, { focusables: [], active: null, onClose: () => {} });
    expect(nothing.seen).toEqual(["prevent"]);
  });

  test("Esc closes the dialog and goes no further", () => {
    let closed = 0;
    const esc = key("Escape");
    handleDialogKey(esc.event, { focusables: [], active: null, onClose: () => (closed += 1) });
    expect(closed).toBe(1);
    expect(esc.seen).toEqual(["prevent", "stop"]);

    const other = key("a");
    handleDialogKey(other.event, { focusables: [], active: null, onClose: () => (closed += 1) });
    expect(closed).toBe(1);
    expect(other.seen).toEqual([]);
  });
});

describe("focus return", () => {
  test("focus goes back to the trigger that opened the dialog", () => {
    let focused = 0;
    const trigger = { isConnected: true, focus: () => (focused += 1) };
    const restore = rememberFocus(trigger);
    expect(focused).toBe(0);
    restore();
    expect(focused).toBe(1);
  });

  test("an element that has left the page, or nothing at all, is left alone", () => {
    let focused = 0;
    rememberFocus({ isConnected: false, focus: () => (focused += 1) })();
    rememberFocus(null)();
    rememberFocus("body")();
    expect(focused).toBe(0);
  });
});

describe("DeskDialog", () => {
  const html = renderToStaticMarkup(
    <DeskDialog open title="Keyboard shortcuts" onClose={() => {}} footer={<button type="button">Done</button>}>
      <p>Body</p>
    </DeskDialog>,
  );

  test("wraps the design system modal: a labelled modal dialog with a close button", () => {
    expect(html.startsWith('<div class="desk-dialog">')).toBe(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}">Keyboard shortcuts</h2>`);
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("Body");
    expect(html).toContain("Done");
  });

  test("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<DeskDialog open={false} title="x" onClose={() => {}} />)).toBe("");
  });

  describe("native browser occlusion", () => {
    const globals = globalThis;
    const saved = { document: Reflect.get(globals, "document"), HTMLElement: Reflect.get(globals, "HTMLElement") };

    afterEach(() => {
      Reflect.set(globals, "document", saved.document);
      Reflect.set(globals, "HTMLElement", saved.HTMLElement);
    });

    /**
     * A page that holds `markup`, with every element laid out. `querySelectorAll` answers the
     * `[role="..."]` alternatives of the selector it is given from the markup's own attributes,
     * so the check below proves the detector's selector matches what DeskDialog renders.
     */
    function pageWith(markup: string) {
      class LaidOut {
        offsetParent = {};
        getClientRects() {
          return [{}];
        }
      }
      Reflect.set(globals, "HTMLElement", LaidOut);
      Reflect.set(globals, "document", {
        querySelectorAll(selector: string) {
          const roles = [...selector.matchAll(/\[role="([^"]+)"\]/g)].map((match) => match[1]);
          expect(roles.length).toBeGreaterThan(0);
          const found = roles.flatMap((role) => markup.match(new RegExp(`role="${role}"`, "g")) ?? []);
          return found.map(() => new LaidOut());
        },
      });
    }

    test("the detector the side panel uses sees an open DeskDialog", () => {
      pageWith(html);
      expect(hasNativeBrowserOccluder()).toBe(true);
    });

    test("and sees nothing once it is closed", () => {
      pageWith('<div class="desk-shell"><main>Work</main></div>');
      expect(hasNativeBrowserOccluder()).toBe(false);
    });
  });
});
