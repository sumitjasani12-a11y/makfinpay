import React from "react";
import { Link } from "react-router-dom";
import {
  Shield, Zap, Smartphone, Wifi, Droplet, Flame, Car, CreditCard,
  Lightbulb, Tv, ArrowRight, CheckCircle2, Phone, Mail, MapPin,
  HeartHandshake, Sparkles, Rocket, Users, Plane, Hotel, Receipt,
  Eye, Target, Wallet
} from "lucide-react";
import Logo from "@/components/Logo";

export const SERVICES = [
  { id: "mobile", icon: Smartphone, title: "Mobile Recharge", desc: "Instant prepaid and postpaid recharge with fast processing." },
  { id: "electricity", icon: Lightbulb, title: "Electricity Bill", desc: "Pay electricity bills securely with quick confirmation." },
  { id: "dth", icon: Tv, title: "DTH Recharge", desc: "Recharge all major DTH operators from a single place." },
  { id: "broadband", icon: Wifi, title: "Broadband & WiFi", desc: "Simple internet bill payment with instant updates." },
  { id: "water", icon: Droplet, title: "Water Bill", desc: "Easy water utility payment via secure digital channel." },
  { id: "gas", icon: Flame, title: "Gas Bill", desc: "Pay LPG and piped gas bills online — quickly and safely." },
  { id: "fastag", icon: Car, title: "FASTag Recharge", desc: "Top up FASTag for uninterrupted highway travel." },
  { id: "creditcard", icon: CreditCard, title: "Credit Card Bill", desc: "Secure and timely credit card bill payments." },
  { id: "travel", icon: Plane, title: "Travel Booking", desc: "Book flights and train tickets quickly and securely from one platform." },
  { id: "hotel", icon: Hotel, title: "Hotel Booking", desc: "Find and book hotels easily with trusted and reliable service." },
  { id: "pos", icon: Receipt, title: "POS Machine", desc: "Point of sale machine services for seamless in-store payment solutions." },
  { id: "insurance", icon: Shield, title: "Insurance", desc: "Comprehensive insurance services for life, health, and vehicle — all in one place." },
];

export const WHY = [
  { id: "secure", icon: Shield, title: "Secure Transactions", desc: "Bank-grade protection on every payment." },
  { id: "fast", icon: Zap, title: "Fast Service", desc: "Quick processing for customer convenience." },
  { id: "easy", icon: Sparkles, title: "Easy To Use", desc: "Simple, intuitive flows for everyone." },
  { id: "support", icon: HeartHandshake, title: "Trusted Support", desc: "Dedicated team to help whenever needed." },
  { id: "growing", icon: Rocket, title: "Growing Platform", desc: "Modern, evolving digital solutions." },
  { id: "customer", icon: Users, title: "Customer First", desc: "We continuously improve based on you." },
];

export const VALUES = [
  { id: "trust", title: "Trust", desc: "Long-term relationships through transparency and reliability." },
  { id: "simplicity", title: "Simplicity", desc: "Easy-to-use digital payment solutions for everyone." },
  { id: "service", title: "Service", desc: "Customer-focused support and smooth experiences." },
  { id: "innovation", title: "Innovation", desc: "Continuously improving our platform with modern tech." },
];

export const HERO_STATS = [
  { id: "services", k: "12+", v: "Utility Services" },
  { id: "secure", k: "100%", v: "Secure & Trusted" },
  { id: "support", k: "24/7", v: "Live Support" },
];

export const BENEFITS = [
  { id: "fast-secure", text: "Fast and secure payments" },
  { id: "multi-utility", text: "Multiple utility services in one place" },
  { id: "simple", text: "Simple and easy process" },
  { id: "support", text: "Reliable customer support" },
  { id: "digital", text: "Convenient digital access" },
  { id: "hassle-free", text: "Hassle-free bill management" },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 bg-[#030712]/75 backdrop-blur-xl border-b border-white/[0.06] transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3.5 group" data-testid="nav-logo">
          <div className="relative p-1 rounded-2xl bg-white/[0.02] border border-white/[0.08] group-hover:border-emerald-500/30 transition-all duration-300">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-0 group-hover:opacity-30 blur-sm transition-all duration-300" />
            <Logo variant="dark" size={38} className="relative" />
          </div>
          <div className="leading-tight">
            <div className="text-xl font-black tracking-tight text-white group-hover:text-emerald-400 transition-colors">MAK FIN PAY</div>
            <div className="text-[9px] tracking-[0.28em] font-black uppercase text-neutral-500">Digital Utility</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-10 text-sm font-semibold">
          <a href="#services" className="text-neutral-400 hover:text-white transition-all duration-300">Services</a>
          <a href="#about" className="text-neutral-400 hover:text-white transition-all duration-300">About</a>
          <a href="#why" className="text-neutral-400 hover:text-white transition-all duration-300">Why Us</a>
          <a href="#contact" className="text-neutral-400 hover:text-white transition-all duration-300">Contact</a>
        </nav>
        <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-neutral-950 font-black text-sm shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 transition-all duration-300" data-testid="nav-login-btn">
          Login <ArrowRight className="h-4 w-4 stroke-[3px]" />
        </Link>
      </div>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-28 lg:pt-32 lg:pb-36 bg-[#030712]">
      {/* Inline styles for custom premium floating animations */}
      <style>{`
        @keyframes float-main {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes float-card {
          0%, 100% { transform: translateY(0) rotate(3deg); }
          50% { transform: translateY(12px) rotate(3deg); }
        }
        .animate-float-main {
          animation: float-main 6s ease-in-out infinite;
        }
        .animate-float-card {
          animation: float-card 8s ease-in-out infinite;
        }
      `}</style>

      {/* Decorative Glow Blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 -z-20 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.07] blur-[130px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 translate-x-1/2 -translate-y-1/2 -z-20 w-[700px] h-[700px] rounded-full bg-cyan-500/[0.07] blur-[150px] pointer-events-none" />
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] -z-30 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-16 items-center">
        <div className="lg:col-span-7 flex flex-col items-start text-left animate-scaleUp">
          <div className="inline-flex items-center gap-2.5 px-4.5 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-xs font-black tracking-widest uppercase mb-8 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <Sparkles className="h-4 w-4" /> Fast · Secure · Reliable
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[72px] tracking-tight leading-[1.03] font-black text-white">
            Simplifying Digital <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">Utility Payments</span> <br /> For Everyone.
          </h1>
          <p className="mt-8 text-base sm:text-lg text-neutral-400 max-w-xl leading-relaxed font-medium">
            Fast, secure, and reliable utility payment solutions designed for modern businesses and customers. From mobile recharge to bill payments, MAK FIN PAY helps users complete essential services quickly and conveniently.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-neutral-950 font-black shadow-[0_0_25px_rgba(16,185,129,0.35)] hover:shadow-[0_0_35px_rgba(16,185,129,0.55)] hover:-translate-y-0.5 transition-all duration-300" data-testid="hero-get-started-btn">
              Get Started <ArrowRight className="h-4.5 w-4.5 stroke-[3px]" />
            </Link>
            <a href="#contact" className="inline-flex items-center justify-center border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] px-8 py-4.5 rounded-2xl text-white font-black hover:-translate-y-0.5 transition-all duration-300" data-testid="hero-contact-btn">
              Contact Us
            </a>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md w-full pt-8 border-t border-white/[0.06]">
            {HERO_STATS.map((s) => (
              <div key={s.id}>
                <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">{s.k}</div>
                <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-neutral-500 mt-2">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5 flex justify-center">
          {/* Glassmorphic Financial Console Mockup */}
          <div className="relative w-full max-w-[480px] h-[460px] select-none">
            {/* Glowing Aura behind console */}
            <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full opacity-10 blur-[100px] pointer-events-none" />
            
            {/* Main Console Box (Glassmorphic Mockup) */}
            <div className="absolute top-4 left-4 w-[380px] rounded-[2rem] bg-[#080d1a]/85 backdrop-blur-3xl border border-white/[0.08] p-6 shadow-2xl shadow-black/80 animate-float-main flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 font-black">makfinpay console</span>
              </div>
              
              {/* Balance Widget */}
              <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-5 flex justify-between items-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <div>
                  <span className="text-[8px] uppercase tracking-[0.15em] text-emerald-400 font-black">system wallet balance</span>
                  <div className="text-2xl font-black text-white mt-1.5">₹37,35,082.83</div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 grid place-items-center text-emerald-400">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>
              
              {/* BBPS widget */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4.5 flex justify-between items-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <div>
                  <span className="text-[8px] uppercase tracking-[0.15em] text-neutral-400 font-black">live bbps gateway</span>
                  <div className="text-sm font-extrabold text-white mt-1.5">100% Operational</div>
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
              </div>
            </div>
            
            {/* Credit Card Overlapping (Premium Hologram glassmorphism look) */}
            <div className="absolute bottom-10 right-4 w-[280px] h-[165px] rounded-3xl bg-gradient-to-br from-indigo-600/40 via-purple-600/30 to-pink-600/20 backdrop-blur-3xl border border-white/[0.12] p-5 shadow-2xl shadow-indigo-500/15 animate-float-card flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[7px] uppercase tracking-[0.2em] text-white/50 font-black">utility premium card</div>
                  <div className="text-sm font-black text-white mt-1">MAK FIN PAY</div>
                </div>
                <Logo variant="dark" size={24} />
              </div>
              <div className="text-xs font-mono tracking-widest text-neutral-200">•••• •••• •••• 1212</div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[6px] uppercase text-white/40 font-black">cardholder</div>
                  <div className="text-[9px] font-bold text-white uppercase mt-0.5">Premium Agent</div>
                </div>
                <div className="h-7 w-10 bg-white/10 rounded-md border border-white/10 flex items-center justify-center text-white/70 font-mono text-[8px]">Rupay</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <section id="about" className="py-24 lg:py-32 bg-gradient-to-b from-[#030712] via-[#080d1a] to-[#030712] relative overflow-hidden border-y border-white/[0.05]">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-20 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-16 items-center">
        <div className="lg:col-span-5 flex justify-center">
          <div className="relative group w-full max-w-[400px]">
            <div className="absolute -inset-1.5 rounded-[2.5rem] bg-gradient-to-r from-purple-500 to-indigo-500 opacity-20 blur-xl group-hover:opacity-35 transition-all duration-700" />
            <div className="relative rounded-[2rem] overflow-hidden border border-white/[0.08] bg-[#090D1A] p-2.5 shadow-2xl">
              <img src={TEAM_IMG} alt="Team" className="rounded-[1.75rem] object-cover h-[400px] w-full scale-100 group-hover:scale-103 transition-transform duration-700" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-7 flex flex-col items-start text-left">
          <div className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs font-black tracking-widest uppercase">
            About MAK FIN PAY
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-4 leading-tight">
            A growing digital utility services company committed to simplifying everyday payments.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-neutral-400 leading-relaxed font-medium">
            MAK FIN PAY is a newly established digital utility services company delivering convenient and secure payment solutions across India. We aim to simplify everyday utility services through a user-friendly platform that helps customers complete transactions quickly and efficiently.
          </p>
          <p className="mt-4 text-sm sm:text-base text-neutral-500 leading-relaxed font-medium">
            Our focus is on reliability, customer satisfaction, and building long-term trust through transparent and smooth services.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ServicesSection() {
  return (
    <section id="services" className="py-24 lg:py-32 relative">
      <div className="absolute top-1/3 right-1/4 -z-20 w-[400px] h-[400px] rounded-full bg-cyan-500/5 blur-[100px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between flex-wrap gap-8 mb-16">
          <div>
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs font-black tracking-widest uppercase">
              Utility Services
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-4 max-w-2xl leading-tight">
              Everything you need, on a single platform.
            </h2>
          </div>
          <div className="hidden md:block p-3.5 rounded-3xl bg-white/[0.02] border border-white/[0.06] shadow-xl shrink-0">
            <img src={SERVICES_IMG} alt="Services" className="h-24 opacity-80" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SERVICES.map((s) => (
            <div key={s.id} className="relative group bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-emerald-500/30 rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_-10px_rgba(16,185,129,0.15)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]" data-testid={`service-card-${s.id}`}>
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 text-emerald-400 border border-emerald-500/25 grid place-items-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <s.icon className="h-5.5 w-5.5 stroke-[1.5]" />
              </div>
              <div className="text-lg font-black text-white tracking-tight">{s.title}</div>
              <p className="mt-2.5 text-xs sm:text-sm text-neutral-400 leading-relaxed font-semibold">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhyChooseSection() {
  return (
    <section id="why" className="py-24 lg:py-32 bg-gradient-to-b from-[#030712] via-[#05140e] to-[#030712] border-y border-white/[0.05] relative overflow-hidden">
      <div className="absolute top-1/4 left-1/3 -z-20 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-16">
          <div className="lg:col-span-5 flex flex-col items-start justify-center">
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs font-black tracking-widest uppercase">
              Why Choose Us
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-4 leading-tight">
              Built on trust, speed, and clarity.
            </h2>
            <p className="mt-6 text-sm sm:text-base text-neutral-400 leading-relaxed font-medium">
              MAK FIN PAY makes everyday payments simpler with a platform that values reliability and customer satisfaction above all.
            </p>
            <div className="relative group mt-10 w-full rounded-[2rem] overflow-hidden border border-white/[0.08] bg-[#090D1A] p-2.5 shadow-2xl">
              <img src={NET_IMG} alt="Network" className="rounded-2xl opacity-90 w-full" />
            </div>
          </div>
          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-6">
            {WHY.map((w) => (
              <div key={w.id} className="bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/20 rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center mb-5 border border-emerald-500/20">
                  <w.icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div className="text-lg font-black text-white tracking-tight">{w.title}</div>
                <p className="mt-2 text-xs sm:text-sm text-neutral-400 leading-relaxed font-semibold">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function VisionMissionSection() {
  return (
    <section className="py-24 lg:py-32 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-20 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8">
        <div className="relative overflow-hidden bg-white/[0.02] border border-white/[0.06] hover:border-indigo-500/30 rounded-[2rem] p-10 transition-all duration-300 hover:-translate-y-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 grid place-items-center mb-6">
            <Eye className="h-6 w-6 stroke-[1.5]" />
          </div>
          <div className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 text-xs font-black tracking-widest uppercase">
            Our Vision
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-4 leading-snug">
            To become a trusted digital utility payment platform that simplifies essential services for everyone.
          </h3>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/[0.02] to-cyan-500/[0.02] border border-emerald-500/10 hover:border-emerald-500/30 rounded-[2rem] p-10 transition-all duration-300 hover:-translate-y-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 grid place-items-center mb-6">
            <Target className="h-6 w-6 stroke-[1.5]" />
          </div>
          <div className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs font-black tracking-widest uppercase">
            Our Mission
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-4 leading-snug">
            Provide fast, secure, accessible utility payments while building trust, transparency and satisfaction.
          </h3>
        </div>
      </div>
    </section>
  );
}

export function BenefitsSection() {
  return (
    <section className="pb-24 lg:pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs font-black tracking-widest uppercase mb-4">
          Benefits
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-12 max-w-2xl leading-tight">
          Why teams choose MAK FIN PAY for daily operations.
        </h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map((b) => (
            <li key={b.id} className="flex items-center gap-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.05] rounded-2xl p-5.5 transition-colors duration-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <CheckCircle2 className="h-5.5 w-5.5 text-emerald-400 shrink-0 stroke-[2.5]" />
              <span className="text-neutral-300 font-semibold text-sm sm:text-base">{b.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ValuesSection() {
  return (
    <section className="py-24 lg:py-32 bg-gradient-to-b from-[#030712] via-[#0b0805] to-[#030712] border-y border-white/[0.05]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 text-xs font-black tracking-widest uppercase mb-4">
          Core Values
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-12 max-w-2xl">What we stand for.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {VALUES.map((v, i) => (
            <div key={v.id} className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.06] hover:border-orange-500/20 rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">{String(i + 1).padStart(2, "0")}</div>
              <div className="text-xl font-black text-white tracking-tight mt-5">{v.title}</div>
              <p className="mt-2.5 text-xs sm:text-sm text-neutral-400 leading-relaxed font-semibold">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section id="contact" className="py-24 lg:py-32 relative">
      <div className="absolute top-1/3 left-1/4 -z-20 w-[400px] h-[400px] rounded-full bg-emerald-500/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-16 items-center">
        <div className="lg:col-span-7 flex flex-col items-start">
          <div className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-xs font-black tracking-widest uppercase">
            Get In Touch
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-4 leading-tight">
            Start your digital payment journey with MAK FIN PAY today.
          </h2>
          <p className="mt-6 text-sm sm:text-base text-neutral-400 leading-relaxed font-semibold">
            Have questions or need assistance? Our team is here to help.
          </p>
          <div className="mt-10 space-y-6 w-full max-w-md">
            <div className="flex items-center gap-4.5 bg-white/[0.01] border border-white/[0.05] rounded-2xl p-4.5">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center shrink-0 border border-emerald-500/20">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Phone</div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">+91 97127 41212</div>
              </div>
            </div>
            <div className="flex items-center gap-4.5 bg-white/[0.01] border border-white/[0.05] rounded-2xl p-4.5">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center shrink-0 border border-emerald-500/20">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Email</div>
                <div className="text-sm sm:text-base font-black text-white mt-0.5">support@makfinpay.com</div>
              </div>
            </div>
            <div className="flex items-start gap-4.5 bg-white/[0.01] border border-white/[0.05] rounded-2xl p-4.5">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center shrink-0 mt-0.5 border border-emerald-500/20">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Office</div>
                <div className="text-xs sm:text-sm font-semibold text-neutral-300 leading-relaxed mt-0.5">
                  Yasin Baug Shop No. 2A, Plot No. 580,<br />
                  AV School Ground Opposite,<br />
                  Near Police Line, Navapara,<br />
                  Bhavnagar - 364001, IN
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 w-full">
          <div className="relative group">
            <div className="absolute -inset-1.5 rounded-[2.5rem] bg-gradient-to-r from-orange-500 to-rose-500 opacity-20 blur-xl group-hover:opacity-35 transition-all duration-700" />
            <div className="relative rounded-[2.25rem] bg-gradient-to-br from-[#090D1A] to-[#030712] border border-white/[0.08] p-10 shadow-2xl flex flex-col items-start shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
              <h3 className="text-2xl font-black text-white tracking-tight">Ready to begin?</h3>
              <p className="mt-3 text-xs sm:text-sm text-neutral-400 leading-relaxed font-semibold">
                Login with your operator credentials to access your dashboard.
              </p>
              <Link to="/login" className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#CC5500] to-[#FD7E14] hover:from-[#A64500] hover:to-[#DD6B20] text-white px-7 py-3.5 text-sm font-black shadow-[0_0_20px_rgba(204,85,0,0.25)] hover:shadow-[0_0_30px_rgba(204,85,0,0.45)] hover:-translate-y-0.5 transition-all duration-300" data-testid="contact-login-btn">
                Open Dashboard <ArrowRight className="h-4 w-4 stroke-[3px]" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-12 bg-[#02050c]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3.5 group">
          <div className="relative p-1 rounded-xl bg-white/[0.02] border border-white/[0.08]">
            <Logo variant="dark" size={26} />
          </div>
          <div className="text-sm font-semibold text-neutral-300">
            MAK FIN PAY <span className="text-neutral-500 font-normal">· Simple Payments. Trusted Service.</span>
          </div>
        </div>
        <div className="text-xs font-semibold text-neutral-500">© {new Date().getFullYear()} MAK FIN PAY. All rights reserved.</div>
      </div>
    </footer>
  );
}
