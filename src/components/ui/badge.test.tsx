import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("applies the size variant instead of passing it to the DOM", () => {
    render(<><Badge size="sm">small</Badge><Badge>regular</Badge></>);
    const small = screen.getByText("small"), regular = screen.getByText("regular");
    expect(small).toHaveClass("text-[10px]", "px-1.5");
    expect(small).not.toHaveClass("text-xs");
    expect(small).not.toHaveAttribute("size");
    expect(regular).toHaveClass("text-xs", "px-2.5");
  });
});
