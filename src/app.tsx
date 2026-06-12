import { Hero } from "./components/Hero";
import { PrivacyBadge } from "./components/PrivacyBadge";
import { Methodology } from "./components/Methodology";

export function App() {
  return (
    <>
      <div class="aurora" aria-hidden="true" />
      <main class="page">
        <Hero />
        <PrivacyBadge />
        {/* Salary form, chart and summaries land in the next steps. */}
        <Methodology />
      </main>
    </>
  );
}
