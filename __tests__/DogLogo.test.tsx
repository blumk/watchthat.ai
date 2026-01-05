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

  it("renders tail wag path when alert is true", () => {
    const { container } = render(<DogLogo alert={true} />);
    // The tail path is only present in alert state
    const paths = container.querySelectorAll("path");
    const tailPath = Array.from(paths).find((p) =>
      p.getAttribute("d")?.startsWith("M46 38")
    );
    expect(tailPath).toBeInTheDocument();
  });

  it("does not render tail wag path when alert is false", () => {
    const { container } = render(<DogLogo alert={false} />);
    const paths = container.querySelectorAll("path");
    const tailPath = Array.from(paths).find((p) =>
      p.getAttribute("d")?.startsWith("M46 38")
    );
    expect(tailPath).toBeUndefined();
  });
});
