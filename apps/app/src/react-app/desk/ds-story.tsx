/** @jsxImportSource react */
import { useState } from "react";
import {
  AppShell,
  Button,
  Composer,
  ComposerMode,
  FactCheckReport,
  Menu,
  Modal,
  PlanDocument,
  ThemeSwitch,
  icons,
} from "@redrob-labs/ui";

/**
 * Dev-only gallery (`#/__ds`) of the design-system components the Desk screens are built from,
 * rendered by the installed `@redrob-labs/ui`, so a version bump can be checked in both themes in
 * the real renderer before any screen depends on it. Sample text only; never routed in production.
 */
export function DsStory() {
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("run");
  const [draft, setDraft] = useState("");

  return (
    <AppShell
      title="Design system"
      meta="@redrob-labs/ui, both themes"
      theme={<ThemeSwitch size="sm" />}
      nav={[
        { id: "story", label: "Components", icon: icons.layout({}), href: "#/__ds", current: true },
        { heading: "Recent" },
        { id: "r1", label: "Sample chat", meta: "09:12", href: "#/__ds" },
      ]}
      actions={
        <Menu
          variant="ghost"
          size="sm"
          label="Menu"
          items={[
            { id: "a", label: "Settings", icon: icons.settings({}) },
            { type: "separator" },
            { id: "v", label: "Version", disabled: true },
          ]}
        />
      }
      foot={
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => setDraft("")}
          placeholder="Ask Desk to do something"
          tools={<ComposerMode value={mode} onChange={(value) => setMode(value)} />}
        />
      }
    >
      <section data-testid="ds-story" style={{ display: "grid", gap: "var(--space-6)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open a modal
          </Button>
          <Button variant="secondary">Secondary</Button>
        </div>
        <PlanDocument
          file="Plan · Sample.md"
          title="A short update, ready to send"
          summary="Nothing is read, sent or changed until you run it."
          sections={[{ heading: "How I will do it", ordered: true, items: [{ lead: "Read.", text: "The latest draft." }] }]}
          todo={[{ label: "Read the latest draft" }, { label: "Write the update" }]}
          status="draft"
        />
        <FactCheckReport
          by="A second AI"
          summary="2 of 3 claims hold."
          claims={[
            { verdict: "holds", claim: "The notice must arrive by October 31." },
            { verdict: "partly", claim: "Email is never valid notice.", note: "It can count once it is read." },
          ]}
        />
      </section>
      <Modal
        open={modalOpen}
        title="A modal"
        onClose={() => setModalOpen(false)}
        footer={<Button onClick={() => setModalOpen(false)}>Close</Button>}
      >
        Esc or the close button dismisses it.
      </Modal>
    </AppShell>
  );
}
