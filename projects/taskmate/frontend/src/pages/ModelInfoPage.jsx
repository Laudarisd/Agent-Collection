// Static Model Information page with product/model details for users.
// ========================
// Imports
// ========================
import "../styles/ModelInfoPage.css";

export default function ModelInfoPage() {
  // ========================
  // Render
  // ========================
  // Simple static content for model details route.
  return (
    <main className="content-page model-info-page">
      <h2>Model information</h2>
      <p>
        This workspace sends authenticated prompt requests to the backend and stores prompt ownership by user account.
      </p>
    </main>
  );
}
