import LandingHero from '../components/landing/LandingHero';
import LandingSections from '../components/landing/LandingSections';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#fafbfc] text-slate-900 overflow-x-hidden">
      <LandingHero />
      <LandingSections />
    </main>
  );
}
