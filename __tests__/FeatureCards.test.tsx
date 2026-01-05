import { render, screen } from "@testing-library/react";
import FeatureCards from "@/components/FeatureCards";

describe("FeatureCards", () => {
  it("renders all four feature card titles", () => {
    render(<FeatureCards />);
    expect(screen.getByText("Instant detection")).toBeInTheDocument();
    expect(screen.getByText("Subscribe & forget")).toBeInTheDocument();
    expect(screen.getByText("Smart diffs")).toBeInTheDocument();
    expect(screen.getByText("Persistent memory")).toBeInTheDocument();
  });

  it("renders the features section with id=features", () => {
    const { container } = render(<FeatureCards />);
    expect(container.querySelector("#features")).toBeInTheDocument();
  });
});
