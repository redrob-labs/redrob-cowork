import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { t } from "../src/i18n";
import {
  DISPLAY_NAME_MAX_LENGTH,
  ProfileView,
  canSaveDisplayName,
  cleanDisplayName,
} from "../src/react-app/desk/settings/profile-group";

describe("profile name", () => {
  test("cleans the way the server does", () => {
    expect(cleanDisplayName("  Park   Hyunjin ")).toBe("Park Hyunjin");
    expect(cleanDisplayName("김지원")).toBe("김지원");
  });

  test("saves only a change that fits", () => {
    expect(canSaveDisplayName("Kim Jiwon", "")).toBe(true);
    expect(canSaveDisplayName(" Kim  Jiwon ", "Kim Jiwon")).toBe(false);
    expect(canSaveDisplayName("", "Kim Jiwon")).toBe(true);
    expect(canSaveDisplayName("가".repeat(DISPLAY_NAME_MAX_LENGTH + 1), "")).toBe(false);
  });

  // Asserted through t() rather than English text: another file in the same run can leave the
  // locale on Korean.
  test("the view says who sees the name and disables an unchanged save", () => {
    const html = renderToStaticMarkup(
      <ProfileView draft="Kim Jiwon" saved="Kim Jiwon" busy={false} onDraft={() => {}} onSave={() => {}} />,
    );
    expect(html).toContain(t("desk.profile_name"));
    expect(html).toContain(t("desk.profile_name_text"));
    expect(html).toContain('value="Kim Jiwon"');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  test("a changed name can be saved", () => {
    const html = renderToStaticMarkup(
      <ProfileView draft="Kim Jiwon" saved="" busy={false} onDraft={() => {}} onSave={() => {}} />,
    );
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });
});
