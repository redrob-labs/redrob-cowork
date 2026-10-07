/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import {
  Accordion as DsAccordion,
  Badge as DsBadge,
  Card as DsCard,
  Table as DsTable,
  Tabs as DsTabs,
} from "@redrob-labs/ui";
import { renderToStaticMarkup } from "react-dom/server";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../src/components/ui/accordion";
import { Badge } from "../../src/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../src/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../src/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../src/components/ui/tabs";
import { parityTree } from "../helpers/ds-parity";

const markup = renderToStaticMarkup;
const rr = (html: string) => new Set(parityTree(html).flatMap((node) => ("rr" in node ? node.rr : [])));
const sorted = (set: Set<string>) => [...set].sort();
const notIn = (app: Set<string>, designSystem: Set<string>) => [...app].filter((name) => !designSystem.has(name));

describe("Badge is the design system's Badge", () => {
  for (const [variant, style, tone] of [
    ["default", "solid", "brand"],
    ["secondary", "subtle", "neutral"],
    ["destructive", "subtle", "danger"],
    ["outline", "outline", "neutral"],
    ["success", "subtle", "success"],
    ["warning", "subtle", "warning"],
    ["info", "subtle", "info"],
  ] as const) {
    test(`${variant} is rr-badge--${style} rr-badge--${tone}`, () => {
      const app = parityTree(markup(<Badge variant={variant}>Beta</Badge>));
      const designSystem = parityTree(
        markup(
          <DsBadge variant={style} tone={tone} size="sm">
            Beta
          </DsBadge>,
        ),
      );
      // The design system wraps the label in its own span; the class set on the
      // badge element is the contract.
      expect(app[0]).toEqual(designSystem[0]);
    });
  }
});

describe("Card is the design system's Card", () => {
  test("frame, title, description and footer use the Card's classes", () => {
    const app = rr(
      markup(
        <Card>
          <CardHeader>
            <CardTitle>Memory</CardTitle>
            <CardDescription>What it keeps between chats.</CardDescription>
          </CardHeader>
          <CardContent>Body</CardContent>
          <CardFooter>Actions</CardFooter>
        </Card>,
      ),
    );
    const designSystem = rr(
      markup(
        <DsCard title="Memory" description="What it keeps between chats." footer="Actions">
          Body
        </DsCard>,
      ),
    );
    expect(sorted(app)).toEqual(["rr-card", "rr-card__desc", "rr-card__footer", "rr-card__title"]);
    expect(notIn(app, designSystem)).toEqual([]);
  });
});

describe("Table is the design system's Table", () => {
  test("the table element is rr-table, and framed adds the design system's wrap", () => {
    const body = (
      <>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>alpha</TableCell>
          </TableRow>
        </TableBody>
      </>
    );
    const designSystem = rr(markup(<DsTable columns={[{ key: "name", label: "Name" }]} rows={[{ name: "alpha" }]} />));
    const plain = rr(markup(<Table>{body}</Table>));
    const framed = rr(markup(<Table framed>{body}</Table>));
    expect(sorted(plain)).toEqual(["rr-table"]);
    expect(sorted(framed)).toEqual(["rr-table", "rr-table-wrap"]);
    expect(notIn(framed, designSystem)).toEqual([]);
    expect(sorted(rr(markup(<Table dense>{body}</Table>)))).toEqual(["rr-table", "rr-table--dense"]);
  });
});

describe("Tabs and Accordion draw the design system's", () => {
  test("tabs are rr-tab in an rr-tabs__list, line or pill, selected by aria-selected", () => {
    const app = markup(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">Files</TabsTrigger>
          <TabsTrigger value="b">Memory</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const designSystem = rr(
      markup(
        <DsTabs
          variant="line"
          items={[
            { id: "a", label: "Files" },
            { id: "b", label: "Memory" },
          ]}
        />,
      ),
    );
    expect(notIn(rr(app), designSystem)).toEqual([]);
    for (const name of ["rr-tabs", "rr-tabs--line", "rr-tabs__list", "rr-tab"]) expect(rr(app).has(name), name).toBe(true);
    expect(app).toContain('role="tab"');
    expect(app).toContain('aria-selected="true"');
    expect(rr(markup(<Tabs defaultValue="a"><TabsList><TabsTrigger value="a">x</TabsTrigger></TabsList></Tabs>)).has("rr-tabs--pill")).toBe(true);
  });

  test("an accordion uses the design system's item, trigger, label and chevron", () => {
    const app = rr(
      markup(
        <Accordion>
          <AccordionItem value="a">
            <AccordionTrigger>What is stored</AccordionTrigger>
            <AccordionContent>Only what you saved.</AccordionContent>
          </AccordionItem>
        </Accordion>,
      ),
    );
    const designSystem = rr(markup(<DsAccordion items={[{ id: "a", title: "What is stored", content: "Only what you saved." }]} />));
    expect(notIn(app, designSystem)).toEqual([]);
    for (const name of ["rr-accordion", "rr-accordion__item", "rr-accordion__trigger", "rr-accordion__label", "rr-accordion__chevron"]) {
      expect(app.has(name), name).toBe(true);
    }
  });
});
