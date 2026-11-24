import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("applies the size variant instead of passing it to the DOM", () => {
    render(<><Badge size="sm">small</Badge><Badge>regular</Badge></>);
    // The label is the badge's own span; the badge is its parent.
    const small = screen.getByText("small").parentElement!, regular = screen.getByText("regular").parentElement!;
    expect(small).toHaveClass("text-count", "px-1.5");
    expect(small).not.toHaveClass("text-xs");
    expect(small).not.toHaveAttribute("size");
    expect(regular).toHaveClass("text-xs", "px-2.5");
  });

  it("ends a constrained label in an ellipsis: the label is its own truncating span", () => {
    render(<Badge className="max-w-[40%]" title="full">a very long label</Badge>);
    const label = screen.getByText("a very long label");
    expect(label.tagName).toBe("SPAN");
    expect(label).toHaveClass("truncate", "min-w-0");
    expect(label.parentElement).toHaveClass("max-w-[40%]"); // the caller's limit wins over the default max-w-full
  });
});
