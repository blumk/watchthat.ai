import { render } from "@testing-library/react";
import DogLogo from "@/components/DogLogo";

describe("DogLogo", () => {
  it("renders an SVG element", () => {
    const { container } = render(<DogLogo />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies the given size to width and height", () => {
    const { container } = render(<DogLogo size={64} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "64");
  });

  it("defaults to size 40", () => {
    const { container } = render(<DogLogo />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
  });

  it("renders alert dot when alert is true", () => {
    const { container } = render(<DogLogo alert={true} />);
    expect(container.querySelector("[data-testid='alert-dot']")).toBeInTheDocument();
  });

  it("does not render alert dot when alert is false", () => {
    const { container } = render(<DogLogo alert={false} />);
    expect(container.querySelector("[data-testid='alert-dot']")).not.toBeInTheDocument();
  });
});
