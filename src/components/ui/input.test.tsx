import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Input, PasswordField, SearchField, inlineEditFrame } from "./input"

describe("text field spec", () => {
  it("a form field draws the approved search look with one neutral focus and an invalid edge", () => {
    render(<Input aria-label="Name" />)
    const field = screen.getByRole("textbox", { name: "Name" })
    expect(field).toHaveClass("h-9", "rounded-md", "border-ink/25", "bg-transparent", "focus-visible:border-ink/50", "aria-[invalid=true]:border-danger")
    expect(field.className).not.toMatch(/accent|shadow-sm|border-input/)
  })

  it("a search field carries the search icon in the box, a bare input and a trailing slot", () => {
    render(<SearchField aria-label="Find a space" trailing={<button type="button">Clear</button>} />)
    const input = screen.getByRole("textbox", { name: "Find a space" })
    const box = input.closest("[data-search-field]") as HTMLElement
    expect(box).toHaveClass("h-9", "rounded-md", "border-ink/25", "bg-transparent", "focus-within:border-ink/50", "has-[[aria-invalid=true]]:border-danger")
    expect(box.querySelector("svg[aria-hidden]")).not.toBeNull()
    expect(input).toHaveClass("border-0", "bg-transparent")
    expect(screen.getByRole("button", { name: "Clear" }).parentElement).toBe(box)
  })

  it("the popup's panel size keeps its 44px box and 15px text", () => {
    render(<SearchField size="panel" aria-label="Find a destination" boxClassName="w-full" />)
    const input = screen.getByRole("textbox", { name: "Find a destination" })
    expect(input.closest("[data-search-field]")).toHaveClass("h-11", "rounded-popup", "w-full")
    expect(input).toHaveClass("text-popup") // 15px on a 22px line (type token)
  })

  it("an inline create/rename frame firms to the same focus edge", () => {
    expect(inlineEditFrame).toContain("focus-within:outline-ink/50")
  })
  it("a password field shows and hides what was typed, and its button names the next action", () => {
    const { container } = render(<><label htmlFor="pw">Password</label><PasswordField id="pw" /></>)
    const input = container.querySelector("#pw") as HTMLInputElement
    expect(input.type).toBe("password")
    expect(input.closest("[data-password-field]")).toHaveClass("h-9", "border-ink/25", "bg-transparent", "focus-within:border-ink/50")
    fireEvent.click(screen.getByRole("button", { name: "Show password" }))
    expect(input.type).toBe("text")
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }))
    expect(input.type).toBe("password")
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute("aria-controls", "pw")
  })
})
