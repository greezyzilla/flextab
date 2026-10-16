import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanTab } from "./PlanTab";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiGetPlan, apiGetBillingStatus, apiGetCheckoutUrl, ApiError } from "~src/services/api";

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
        await screen.findByText("Current");
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
