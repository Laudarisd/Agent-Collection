// Static About page content shown from top-right menu routing.
// ========================
// Imports
// ========================
import "../styles/AboutPage.css";

export default function AboutPage() {
  // ========================
  // Render
  // ========================
  // Simple static content for About route.
  return (
    <main className="content-page about-page">
      <h2>About us</h2>
      <p>
        TaskMate helps teams turn prompts into actionable technical outputs while preserving traceability.
      </p>
    </main>
  );
}
