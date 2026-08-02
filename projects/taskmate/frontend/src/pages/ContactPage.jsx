// Static Contact page content shown from top-right menu routing.
// ========================
// Imports
// ========================
import "../styles/ContactPage.css";

export default function ContactPage() {
  // ========================
  // Render
  // ========================
  // Simple static content for Contact route.
  return (
    <main className="content-page contact-page">
      <h2>Contact us</h2>
      <p>Email: support@coding-agent.local</p>
      <p>For enterprise setup, include your preferred database and deployment stack.</p>
    </main>
  );
}
