import Navbar from "@/components/landing/navbar"
import Hero from "@/components/landing/hero"
import Features from "@/components/landing/features"
import About from "@/components/landing/about"
import Pricing from "@/components/landing/pricing"
import Footer from "@/components/landing/footer"

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
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
