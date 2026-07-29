import React from "react";
import {
  LandingNav, HeroSection, AboutSection, ServicesSection, WhyChooseSection,
  VisionMissionSection, BenefitsSection, ValuesSection, ContactSection, LandingFooter,
} from "./landing/sections";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-[#1B4332]">
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
