import { render, screen } from "@testing-library/react";
import PlatformDiagram from "@/components/PlatformDiagram";

describe("PlatformDiagram", () => {
  it("renders the three platform tiers", () => {
    render(<PlatformDiagram />);
    expect(screen.getByText("Ingest")).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
  });

  it("renders representative ingest sources", () => {
    render(<PlatformDiagram />);
    expect(screen.getByText("Web crawlers")).toBeInTheDocument();
    expect(screen.getByText("REST & GraphQL")).toBeInTheDocument();
    expect(screen.getByText("MCP servers")).toBeInTheDocument();
  });

  it("renders the agentic platform tier as Agents / Memory / Intelligence", () => {
    render(<PlatformDiagram />);
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Intelligence")).toBeInTheDocument();
  });

  it("frames Agents as watching continuously like humans", () => {
    render(<PlatformDiagram />);
    expect(screen.getByText(/like humans do/i)).toBeInTheDocument();
  });

  it("renders subscriber surfaces", () => {
    render(<PlatformDiagram />);
    expect(screen.getByText("REST API")).toBeInTheDocument();
    expect(screen.getByText("MCP tool")).toBeInTheDocument();
    expect(screen.getByText("Feed & email")).toBeInTheDocument();
  });

  it("has an accessible architecture label", () => {
    render(<PlatformDiagram />);
    expect(
      screen.getByRole("img", { name: /platform architecture/i }),
    ).toBeInTheDocument();
  });
});
