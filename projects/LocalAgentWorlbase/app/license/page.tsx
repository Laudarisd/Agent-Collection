import { APP_NAME } from "@/lib/constants";

export default function LicensePage() {
  const owner = process.env.NEXT_PUBLIC_APP_COPYRIGHT || "Sudip Laudari";
  return (
    <main className="legal-page">
      <article>
        <a className="legal-back" href="/">← Back to {APP_NAME}</a>
        <h1>Software License</h1>
        <p>Copyright © 2026 {owner}. All rights reserved.</p>
        <p>This software and its source code are proprietary. Permission is not granted to copy, modify, distribute, sublicense, sell, publish, or create derivative works from this software without prior written permission from the copyright holder.</p>
        <p>You may use the software for your own authorized personal or organizational purposes. Third-party APIs, AI models, runtimes, and model files remain subject to their own licenses and terms.</p>
        <p>The software is provided “as is”, without warranties of any kind, to the maximum extent permitted by applicable law.</p>
      </article>
    </main>
  );
}
