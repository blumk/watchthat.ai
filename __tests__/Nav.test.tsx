import { render, screen } from "@testing-library/react";
import Nav from "@/components/Nav";

describe("Nav", () => {
  it("renders the Watchdog brand name", () => {
    render(<Nav />);
    expect(screen.getByText("Watchdog")).toBeInTheDocument();
  });

  it("renders Features link pointing to #features", () => {
    render(<Nav />);
    const link = screen.getByText("Features");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#features");
  });

  it("renders How it works link pointing to #how", () => {
    render(<Nav />);
    const link = screen.getByText("How it works");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#how");
  });
});
