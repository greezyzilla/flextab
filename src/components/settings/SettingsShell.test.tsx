import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsContent, SettingsNav } from "./SettingsShell";
import { ACCOUNT_ONLY, SECTION_LABEL, SETTINGS_GROUPS, SETTINGS_TABS } from "./types";
import { useAuthStore } from "~src/store/useAuthStore";

// Keep route integration real; section data loading is covered by its own tests.
vi.mock("./SpacesTab", () => ({ SpacesTab: () => <p>Spaces content</p> }));
vi.mock("./SavingTab", () => ({ SavingTab: () => <p>Saving content</p> }));
vi.mock("./AppearanceTab", () => ({
  ThemeTab: () => <p>Theme content</p>, DisplayTab: () => <p>Display content</p>,
  LayoutTab: () => <p>Layout content</p>, OpeningTab: () => <p>Opening content</p>,
  ResetAppearanceButton: () => <button type="button">Reset appearance</button>,
}));
vi.mock("./AppearancePreview", () => ({ AppearancePreview: () => <p>Preview</p> }));
vi.mock("./SyncTab", () => ({ SyncTab: () => <p>Sync content</p> }));
vi.mock("./BackupTab", () => ({ BackupTab: () => <p>Backup content</p> }));
vi.mock("./PlanTab", () => ({ PlanTab: () => <p>Plan &amp; billing content</p> }));
vi.mock("./TransactionsTab", () => ({ TransactionsTab: () => <p>Transactions content</p> }));
vi.mock("./AccountTab", () => ({ ProfileTab: () => <p>Profile content</p>, SecurityTab: () => <p>Sign-in &amp; security content</p> }));

// Signed in unless a test says otherwise: a guest's Settings has no account pages (TASK-84).
beforeEach(() => { window.history.replaceState(null, "", "#/settings"); useAuthStore.setState({ isAuthenticated: true }); });

/** Topics made of two pages show the first one's content (TASK-84). */
const CONTENT: Partial<Record<string, string>> = { saving: "Saving content", backup: "Sync content" };

describe("compact settings navigation", () => {
  // jsdom has no tab groups, so Opening is not offered (its own test covers that).
  it.each(SETTINGS_TABS)("navigates to %s with the labelled section selector", async section => {
    const user = userEvent.setup();
    render(<SettingsContent />);
    const select = screen.getByRole("combobox", { name: "Settings section" });
    expect(screen.getByRole("option", { name: SECTION_LABEL[section] })).toHaveValue(section);
    await user.tab();
    expect(select).toHaveFocus();
    await user.selectOptions(select, section);
    await waitFor(() => expect(window.location.hash).toBe(`#/settings/${section}`));
    expect(select).toHaveValue(section);
    expect(screen.getByText(CONTENT[section] ?? `${SECTION_LABEL[section]} content`)).toBeInTheDocument();
    expect(select).toHaveFocus();
  });

  it("reflects deep links and later hash navigation in the selector and content", async () => {
    window.history.replaceState(null, "", "#/settings/backup");
    render(<SettingsContent />);
    const select = screen.getByRole("combobox", { name: "Settings section" });
    expect(select).toHaveValue("backup");
    expect(screen.getByText("Backup content")).toBeInTheDocument();
    window.location.hash = "/settings/security";
    await waitFor(() => expect(select).toHaveValue("security"));
    expect(screen.getByText("Sign-in & security content")).toBeInTheDocument();
    expect(screen.queryByText("Backup content")).not.toBeInTheDocument();
  });

  it("Escape leaves Settings, but not when a modal or menu already handled it (TASK-43)", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SettingsContent />);
    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/settings");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(back.mock.calls.length + (window.location.hash === "#/" ? 1 : 0)).toBe(1);
    back.mockRestore();
  });

  it("falls back to Theme for an unknown section, and sends links from before TASK-84 to their new topic", () => {
    window.history.replaceState(null, "", "#/settings/unknown");
    const { unmount } = render(<SettingsContent />);
    expect(screen.getByRole("combobox", { name: "Settings section" })).toHaveValue("theme");
    expect(screen.getByText("Theme content")).toBeInTheDocument();
    unmount();
    for (const [old, now, text] of [["appearance", "theme", "Theme content"], ["account", "profile", "Profile content"], ["plan", "plan", "Plan & billing content"], ["transactions", "plan", "Transactions content"], ["sync", "backup", "Backup content"], ["opening", "saving", "Saving content"]]) {
      window.history.replaceState(null, "", `#/settings/${old}`);
      const view = render(<SettingsContent />);
      expect(screen.getByRole("combobox", { name: "Settings section" })).toHaveValue(now);
      expect(screen.getByText(text)).toBeInTheDocument();
      view.unmount();
    }
  });

  it("groups the topics under the same headings in the nav and in the narrow selector (TASK-84)", () => {
    render(<><SettingsNav /><SettingsContent /></>);
    for (const group of SETTINGS_GROUPS) {
      const list = screen.getByRole("list", { name: group.heading });
      for (const id of group.topics) {
        expect(list).toContainElement(screen.getByRole("link", { name: SECTION_LABEL[id] }));
      }
      expect(screen.getByRole("group", { name: group.heading })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("hides the account pages from a guest and sends a guest's link to one to Theme (TASK-84)", () => {
    useAuthStore.setState({ isAuthenticated: false });
    window.history.replaceState(null, "", "#/settings/plan");
    render(<><SettingsNav /><SettingsContent /></>);
    for (const id of ACCOUNT_ONLY) {
      expect(screen.queryByRole("link", { name: SECTION_LABEL[id] })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: SECTION_LABEL[id] })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("list", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Settings section" })).toHaveValue("theme");
    expect(screen.getByText("Theme content")).toBeInTheDocument();
  });

  it("shows the app version under the settings nav (TASK-15)", () => {
    render(<SettingsNav />);
    expect(screen.getByText(/^FlexTab v\d/)).toBeInTheDocument();
  });

  it("is navigation, not tabs: each section is a link and the open one is the current page (TASK-28)", () => {
    window.location.hash = "#/settings/backup";
    render(<SettingsNav />);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    const backup = screen.getByRole("link", { name: "Sync & backup" });
    expect(nav).toContainElement(backup);
    expect(backup).toHaveAttribute("aria-current", "page");
    expect(backup).toHaveAttribute("href", "#/settings/backup");
    expect(screen.getByRole("link", { name: "Spaces" })).not.toHaveAttribute("aria-current");
  });

  it("titles the section with a level-two heading under the nav's Settings (TASK-28)", () => {
    window.location.hash = "#/settings/spaces";
    render(<SettingsContent />);
    expect(screen.getByRole("heading", { level: 2, name: "Spaces" })).toBeInTheDocument();
  });
});
