import { render, screen } from "@testing-library/react";
import Pricing from "@/components/Pricing";

describe("Pricing", () => {
  it("renders the three plan names", () => {
    render(<Pricing />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("renders the pricing section with id=pricing", () => {
    const { container } = render(<Pricing />);
    expect(container.querySelector("#pricing")).toBeInTheDocument();
  });

  it("marks Pro as most popular", () => {
    render(<Pricing />);
    expect(screen.getByText(/most popular/i)).toBeInTheDocument();
  });
});
