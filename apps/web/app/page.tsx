import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import Features from "@/components/landing/Features"
import About from "@/components/landing/About"
import Pricing from "@/components/landing/Pricing"
import Footer from "@/components/landing/Footer"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Navbar />
      <main className="flex-grow">
        <Hero />
        <Features />
        <About />
        <Pricing />
        <Footer />
      </main>
    </div>
  )
}
