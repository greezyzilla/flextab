import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanTab } from "./PlanTab";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetPlan, apiGetBillingStatus, apiGetCheckoutUrl, ApiError } from "~src/services/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Short poll steps so the confirm schedule runs out within a test (the real one is ~34 s).
vi.mock("./shared", async importOriginal => ({ ...await importOriginal<typeof import("./shared")>(), CONFIRM_POLL_DELAYS: [0, 5, 5, 5] }));

vi.mock("~src/services/api", async importOriginal => ({
  ...await importOriginal<typeof import("~src/services/api")>(),
  apiGetPlan: vi.fn(),
  apiGetBillingStatus: vi.fn(),
  apiGetCheckoutUrl: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true });
  vi.mocked(apiGetPlan).mockResolvedValue({
    plan: "free",
    limits: { max_tabs_total: 150, max_tree_bytes: 524288, max_snapshots: 10 },
    usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 },
  });
  vi.mocked(apiGetBillingStatus).mockResolvedValue({ plan: "free", active: false });
});

describe("checkout availability feedback", () => {
  it.each(["billing temporarily unavailable", "billing not configured"])(
    "shows unavailability for %s without claiming beta policy or opening checkout", async message => {
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      try {
        vi.mocked(apiGetCheckoutUrl).mockRejectedValueOnce(new ApiError(503, message));
        render(<PlanTab />);
        await screen.findByRole("button", { name: "Current plan" });
        fireEvent.click(screen.getByRole("button", { name: "Upgrade to Plus" }));
        expect(await screen.findByText("Upgrades are currently unavailable. Please try again later.")).toBeInTheDocument();
        expect(screen.queryByText(/aren’t available yet during the beta/)).not.toBeInTheDocument();
        expect(open).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Upgrade to Plus" })).toBeEnabled();
        // A later explicit retry can succeed after service recovery.
        vi.mocked(apiGetCheckoutUrl).mockResolvedValueOnce("https://checkout.example.test/session");
        fireEvent.click(screen.getByRole("button", { name: "Upgrade to Plus" }));
        await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith("https://checkout.example.test/session", "_blank", "noopener"));
        expect(apiGetCheckoutUrl).toHaveBeenCalledTimes(2);
        expect(screen.queryByText("Upgrades are currently unavailable. Please try again later.")).not.toBeInTheDocument();
      } finally { open.mockRestore(); }
    },
  );
});

describe("a paid checkout coming back (TASK-96)", () => {
  const LIMITS = { max_tabs_total: 150, max_tree_bytes: 524288, max_snapshots: 10 };
  const result = (outcome: string) => vi.mocked(chrome.storage.local.get).mockImplementationOnce(((_k: unknown, cb?: (r: object) => void) => {
    const r = { flextab_billing_result: { outcome } }; if (cb) cb(r); return Promise.resolve(r);
  }) as never);

  it("replaces the payment toast with the plan the user now has", async () => {
    vi.mocked(apiGetPlan)
      .mockResolvedValueOnce({ plan: "free", limits: LIMITS, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } })
      .mockResolvedValue({ plan: "plus", limits: { ...LIMITS, max_tabs_total: 2000 }, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } });
    result("success");
    render(<PlanTab />);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("You're on Plus", { id: "billing-result", description: "Up to 2,000 tabs." }));
  });

  it("never says the user is on Free", async () => {
    result("success");
    render(<PlanTab />);
    await waitFor(() => expect(apiGetPlan).toHaveBeenCalledTimes(2));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("confirming a payment when the page opens after checkout (TASK-101)", () => {
  const LIMITS = { max_tabs_total: 150, max_tree_bytes: 524288, max_snapshots: 10 };
  const FREE = { plan: "free", limits: LIMITS, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } };
  const PLUS = { plan: "plus", limits: { ...LIMITS, max_tabs_total: 2000 }, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } };
  const stored = () => vi.mocked(chrome.storage.local.get).mockImplementationOnce(((_k: unknown, cb?: (r: object) => void) => {
    const r = { flextab_billing_result: { outcome: "success" } }; if (cb) cb(r); return Promise.resolve(r);
  }) as never);

  it("keeps confirming when the stored result is read before the first plan load", async () => {
    let finishLoad!: (s: typeof FREE) => void;
    vi.mocked(apiGetPlan)
      .mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; })) // the page's own load, slow
      .mockResolvedValueOnce(FREE).mockResolvedValueOnce(FREE)                       // webhook not landed yet
      .mockResolvedValue(PLUS);
    stored();
    render(<PlanTab />);
    // Give any early poll time to answer Free; the page must still be confirming.
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(screen.getByText(/Confirming your payment/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    finishLoad(FREE);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("You're on Plus", { id: "billing-result", description: "Up to 2,000 tabs." }));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Confirming your payment/)).not.toBeInTheDocument();
  });

  it("says the payment is still being confirmed when the schedule runs out, and checks again on request", async () => {
    vi.mocked(apiGetPlan).mockResolvedValue(FREE);
    stored();
    render(<PlanTab />);
    const again = await screen.findByRole("button", { name: "Check again" }, { timeout: 3000 });
    expect(screen.getByText(/still being confirmed/)).toBeInTheDocument();
    expect(screen.queryByText(/limits are generous/)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    vi.mocked(apiGetPlan).mockResolvedValue(PLUS);
    fireEvent.click(again);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("You're on Plus", { id: "billing-result", description: "Up to 2,000 tabs." }));
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
  });
});
