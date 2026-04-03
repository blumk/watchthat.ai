import { render, screen } from "@testing-library/react";
import Nav from "@/components/Nav";

describe("Nav", () => {
  it("renders the Watchdog brand name", () => {
    render(<Nav />);
    expect(screen.getByText("Watchdog")).toBeInTheDocument();
  });

  it("renders How it works link pointing to #how", () => {
    render(<Nav />);
    const link = screen.getByText("How it works");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#how");
  });

  it("renders Pricing link pointing to #pricing", () => {
    render(<Nav />);
    const link = screen.getByText("Pricing");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#pricing");
  });
});
