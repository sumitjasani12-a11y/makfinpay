import React from "react";
import { Link } from "react-router-dom";
import {
  Shield, Zap, Smartphone, Wifi, Droplet, Flame, Car, CreditCard,
  Lightbulb, Tv, ArrowRight, CheckCircle2, Phone, Mail, MapPin,
  HeartHandshake, Sparkles, Rocket, Users, Plane, Hotel, Receipt
} from "lucide-react";
import Logo from "@/components/Logo";

export const HERO_BG = "https://static.prod-images.emergentagent.com/jobs/4435fab4-fa13-47b5-be07-f927a34d78ae/images/d1c97dc87b4387f65bd1f92ab7e8f5c82b7cb0b0edc3d929082ae6ddf85ad45e.png";
export const SERVICES_IMG = "https://static.prod-images.emergentagent.com/jobs/4435fab4-fa13-47b5-be07-f927a34d78ae/images/5762606c4317726bc335ef5d98c8964cc9d9fd0bc2d20a367fefc6dafafb29cf.png";
export const NET_IMG = "https://static.prod-images.emergentagent.com/jobs/4435fab4-fa13-47b5-be07-f927a34d78ae/images/1b6162600c64b957c27c0c2c3e222bc03610df0a0a709b5522f1a1c2b183971e.png";
export const TEAM_IMG = "https://images.unsplash.com/photo-1690378820474-b468b8ee64d3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwyfHxidXNpbmVzcyUyMHRlYW0lMjBvZmZpY2V8ZW58MHx8fHwxNzc4NzU4MTA2fDA&ixlib=rb-4.1.0&q=85";
export const PAY_IMG = "https://images.unsplash.com/photo-1599050751795-6cdaafbc2319?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzOTB8MHwxfHNlYXJjaHwyfHxkaWdpdGFsJTIwcGF5bWVudCUyMHNtYXJ0cGhvbmV8ZW58MHx8fHwxNzc4NzU4MTA2fDA&ixlib=rb-4.1.0&q=85";

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
  { id: "services", k: "8+", v: "Utility Services" },
  { id: "secure", k: "100%", v: "Secure" },
  { id: "support", k: "24/7", v: "Support" },
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
    <header className="sticky top-0 z-50 bg-[#FDFCF8]/80 backdrop-blur-xl border-b border-black/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
          <Logo variant="dark" size={36} />
          <div className="leading-tight">
            <div className="text-base font-semibold">MAK FIN PAY</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-neutral-500">Digital Utility</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="#services" className="text-neutral-600 hover:text-[#1B4332] transition-colors">Services</a>
          <a href="#about" className="text-neutral-600 hover:text-[#1B4332] transition-colors">About</a>
          <a href="#why" className="text-neutral-600 hover:text-[#1B4332] transition-colors">Why Us</a>
          <a href="#contact" className="text-neutral-600 hover:text-[#1B4332] transition-colors">Contact</a>
        </nav>
        <Link to="/login" className="mfp-btn-primary" data-testid="nav-login-btn">
          Login <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{ backgroundImage: `url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "right center" }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#FDFCF8] via-[#FDFCF8]/95 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 fade-up">
          <div className="mfp-pill bg-[#E8E5D7] text-[#1B4332] mb-6">
            <Sparkles className="h-3.5 w-3.5" /> Fast. Secure. Reliable.
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-none font-medium">
            Simplifying Digital <br />
            <span className="text-[#CC5500]">Utility Payments</span> <br /> For Everyone.
          </h1>
          <p className="mt-6 text-lg text-neutral-600 max-w-xl leading-relaxed">
            Fast, secure, and reliable utility payment solutions designed for modern businesses and customers. From mobile recharge to bill payments, MAK FIN PAY helps users complete essential services quickly and conveniently.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/login" className="mfp-btn-primary" data-testid="hero-get-started-btn">
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#contact" className="mfp-btn-outline" data-testid="hero-contact-btn">Contact Us</a>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-6 max-w-md">
            {HERO_STATS.map((s) => (
              <div key={s.id}>
                <div className="text-3xl font-semibold tracking-tight">{s.k}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5 fade-up">
          <div className="relative">
            <img src={PAY_IMG} alt="Digital payment" className="rounded-3xl shadow-2xl object-cover h-[460px] w-full border border-black/5" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <section id="about" className="py-24 lg:py-32 bg-[#F4F3ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-5">
          <img src={TEAM_IMG} alt="Team" className="rounded-3xl object-cover h-[420px] w-full border border-black/5" />
        </div>
        <div className="lg:col-span-7">
          <div className="mfp-overline">About MAK FIN PAY</div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-tight font-medium mt-3">
            A growing digital utility services company committed to simplifying everyday payments.
          </h2>
          <p className="mt-6 text-lg text-neutral-600 leading-relaxed">
            MAK FIN PAY is a newly established digital utility services company delivering convenient and secure payment solutions across India. We aim to simplify everyday utility services through a user-friendly platform that helps customers complete transactions quickly and efficiently.
          </p>
          <p className="mt-4 text-base text-neutral-600 leading-relaxed">
            Our focus is on reliability, customer satisfaction, and building long-term trust through transparent and smooth services.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ServicesSection() {
  return (
    <section id="services" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
          <div>
            <div className="mfp-overline">Utility Services</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-tight font-medium mt-3 max-w-2xl">
              Everything you need, on a single platform.
            </h2>
          </div>
          <img src={SERVICES_IMG} alt="Services" className="h-28 hidden md:block" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SERVICES.map((s) => (
            <div key={s.id} className="mfp-card p-6" data-testid={`service-card-${s.id}`}>
              <div className="h-12 w-12 rounded-xl bg-[#E8E5D7] text-[#1B4332] grid place-items-center mb-5">
                <s.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div className="text-lg font-medium">{s.title}</div>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhyChooseSection() {
  return (
    <section id="why" className="py-24 lg:py-32 bg-[#1B4332] text-[#FDFCF8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="text-xs uppercase tracking-[0.2em] font-semibold text-[#E8E5D7]/80">Why Choose Us</div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-tight font-medium mt-3">
              Built on trust, speed, and clarity.
            </h2>
            <p className="mt-6 text-[#E8E5D7]/80 leading-relaxed">
              MAK FIN PAY makes everyday payments simpler with a platform that values reliability and customer satisfaction above all.
            </p>
            <img src={NET_IMG} alt="Network" className="mt-8 rounded-2xl border border-white/10 opacity-90" />
          </div>
          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-6">
            {WHY.map((w) => (
              <div key={w.id} className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                <w.icon className="h-6 w-6 text-[#E8E5D7] mb-4" strokeWidth={1.5} />
                <div className="text-lg font-medium">{w.title}</div>
                <p className="mt-2 text-sm text-[#E8E5D7]/75 leading-relaxed">{w.desc}</p>
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
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8">
        <div className="mfp-card p-10">
          <div className="mfp-overline">Our Vision</div>
          <h3 className="text-2xl sm:text-3xl font-medium mt-3 leading-tight">
            To become a trusted digital utility payment platform that simplifies essential services for everyone.
          </h3>
        </div>
        <div className="mfp-card p-10 bg-[#E8E5D7]/40">
          <div className="mfp-overline">Our Mission</div>
          <h3 className="text-2xl sm:text-3xl font-medium mt-3 leading-tight">
            Provide fast, secure, accessible utility payments while building trust, transparency and satisfaction.
          </h3>
        </div>
      </div>
    </section>
  );
}

export function BenefitsSection() {
  return (
    <section className="pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mfp-overline">Benefits</div>
        <h2 className="text-3xl sm:text-4xl tracking-tight font-medium mt-3 mb-12 max-w-2xl">
          Why teams choose MAK FIN PAY for daily operations.
        </h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENEFITS.map((b) => (
            <li key={b.id} className="flex items-start gap-3 bg-[#F4F3ED] rounded-2xl p-5">
              <CheckCircle2 className="h-5 w-5 text-[#2D6A4F] mt-0.5" />
              <span className="text-neutral-700">{b.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ValuesSection() {
  return (
    <section className="py-24 bg-[#F4F3ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mfp-overline">Core Values</div>
        <h2 className="text-3xl sm:text-4xl tracking-tight font-medium mt-3 mb-12 max-w-2xl">What we stand for.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {VALUES.map((v, i) => (
            <div key={v.id} className="mfp-card p-8">
              <div className="text-3xl font-medium text-[#CC5500]">{String(i + 1).padStart(2, "0")}</div>
              <div className="text-xl font-medium mt-4">{v.title}</div>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section id="contact" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="mfp-overline">Get In Touch</div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl tracking-tight font-medium mt-3 leading-tight">
            Start your digital payment journey with MAK FIN PAY today.
          </h2>
          <p className="mt-6 text-lg text-neutral-600">Have questions or need assistance? Our team is here to help.</p>
          <div className="mt-10 space-y-5">
            <div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-[#E8E5D7] grid place-items-center"><Phone className="h-5 w-5" /></div><div><div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Phone</div><div className="text-base font-medium">+91 97127 41212</div></div></div>
            <div className="flex items-center gap-4"><div className="h-11 w-11 rounded-xl bg-[#E8E5D7] grid place-items-center"><Mail className="h-5 w-5" /></div><div><div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Email</div><div className="text-base font-medium">support@makfinpay.com</div></div></div>
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-[#E8E5D7] grid place-items-center shrink-0"><MapPin className="h-5 w-5" /></div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Office</div>
                <div className="text-base font-medium leading-relaxed">
                  Yasin Baug Shop No. 2A, Plot No. 580,<br />
                  AV School Ground Opposite,<br />
                  Near Police Line, Navapara,<br />
                  Bhavnagar - 364001, IN
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-[#1B4332] text-white p-10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-[#1B4332]">
          <h3 className="text-2xl font-medium text-white">Ready to begin?</h3>
          <p className="mt-3 text-white/90">Login with your agent credentials to access your dashboard.</p>
          <Link to="/login" className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[#CC5500] hover:bg-[#A64500] text-white px-5 py-3 text-sm font-semibold transition-colors" data-testid="contact-login-btn">
            Open Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-black/5 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Logo variant="dark" size={28} />
          <div className="text-sm font-medium">MAK FIN PAY · Simple Payments. Trusted Service.</div>
        </div>
        <div className="text-xs text-neutral-500">© {new Date().getFullYear()} MAK FIN PAY. All rights reserved.</div>
      </div>
    </footer>
  );
}
