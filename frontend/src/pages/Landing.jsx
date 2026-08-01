import React from "react";
import {
  LandingNav, HeroSection, AboutSection, ServicesSection, WhyChooseSection,
  VisionMissionSection, BenefitsSection, ValuesSection, ContactSection, LandingFooter,
} from "./landing/sections";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#030712] text-neutral-100 font-sans selection:bg-[#10B981] selection:text-neutral-900">
      <LandingNav />
      <HeroSection />
      <AboutSection />
      <ServicesSection />
      <WhyChooseSection />
      <VisionMissionSection />
      <BenefitsSection />
      <ValuesSection />
      <ContactSection />
      <LandingFooter />
    </div>
  );
}
