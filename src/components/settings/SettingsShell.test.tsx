import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsContent, SettingsNav } from "./SettingsShell";
import { SECTION_LABEL, SETTINGS_TABS } from "./types";

// Keep route integration real; section data loading is covered by its own tests.
vi.mock("./SpacesTab", () => ({ SpacesTab: () => <p>Spaces content</p> }));
vi.mock("./AppearanceTab", () => ({ AppearanceTab: () => <p>Appearance content</p> }));
vi.mock("./SyncTab", () => ({ SyncTab: () => <p>Sync content</p> }));
vi.mock("./BackupTab", () => ({ BackupTab: () => <p>Backup content</p> }));
vi.mock("./PlanTab", () => ({ PlanTab: () => <p>Plan content</p> }));
vi.mock("./TransactionsTab", () => ({ TransactionsTab: () => <p>Transactions content</p> }));
vi.mock("./AccountTab", () => ({ AccountTab: () => <p>Account content</p> }));

beforeEach(() => window.history.replaceState(null, "", "#/settings"));

describe("compact settings navigation", () => {
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
    expect(screen.getByText(`${section === "plan" ? "Plan" : SECTION_LABEL[section]} content`)).toBeInTheDocument();
    expect(select).toHaveFocus();
  });

  it("reflects deep links and later hash navigation in the selector and content", async () => {
    window.history.replaceState(null, "", "#/settings/backup");
    render(<SettingsContent />);
    const select = screen.getByRole("combobox", { name: "Settings section" });
    expect(select).toHaveValue("backup");
    expect(screen.getByText("Backup content")).toBeInTheDocument();
    window.location.hash = "/settings/account";
    await waitFor(() => expect(select).toHaveValue("account"));
    expect(screen.getByText("Account content")).toBeInTheDocument();
    expect(screen.queryByText("Backup content")).not.toBeInTheDocument();
  });

  it("falls back to Appearance for an unknown section", () => {
    window.history.replaceState(null, "", "#/settings/unknown");
    render(<SettingsContent />);
    expect(screen.getByRole("combobox", { name: "Settings section" })).toHaveValue("appearance");
    expect(screen.getByText("Appearance content")).toBeInTheDocument();
  });

  it("shows the app version under the settings nav (TASK-15)", () => {
    render(<SettingsNav />);
    expect(screen.getByText(/^FlexTab v\d/)).toBeInTheDocument();
  });
});
