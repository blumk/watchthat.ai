import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import FeatureCards from "@/components/FeatureCards";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-hidden">
      <Nav />
      <Hero />
      <FeatureCards />
      <div className="max-w-[900px] mx-auto px-6">
        <div className="h-px bg-[var(--bdr)]" />
      </div>
      <HowItWorks />
      <Footer />
    </div>
  );
}
