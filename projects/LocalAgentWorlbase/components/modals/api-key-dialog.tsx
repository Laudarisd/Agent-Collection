"use client";

import { useEffect, useState } from "react";
import { detectCloudProvider, providerLabel } from "@/lib/provider-detection";
import type { CloudCredential, CloudProvider, ModelDescriptor } from "@/lib/types";
import { Modal } from "@/components/modals/modal";

const providers: Array<{ id: CloudProvider; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude / Anthropic" },
  { id: "gemini", label: "Gemini / Google" },
];

export function ApiKeyDialog({
  open,
  credential,
  onClose,
  onSave,
  onDisconnect,
}: {
  open: boolean;
  credential: CloudCredential | null;
  onClose: () => void;
  onSave: (credential: CloudCredential, models: ModelDescriptor[]) => void;
  onDisconnect: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<CloudProvider>("openai");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoDetected, setAutoDetected] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApiKey(credential?.apiKey || "");
    setProvider(credential?.provider || "openai");
    setRemember(credential?.remember || false);
    setError("");
  }, [open, credential]);

  function updateKey(value: string) {
    setApiKey(value);
    const detected = detectCloudProvider(value);
    if (detected) {
      setProvider(detected);
      setAutoDetected(true);
    } else {
      setAutoDetected(false);
    }
  }

  async function connect() {
    const key = apiKey.trim();
    if (!key) { setError("Enter an API key."); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const data = (await response.json()) as { models?: ModelDescriptor[]; error?: string };
      if (!response.ok) throw new Error(data.error || "The API key could not be verified.");
      if (!data.models?.length) throw new Error("The key was accepted, but no compatible generation models were returned for this account.");
      onSave({ provider, apiKey: key, remember }, data.models);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The API key could not be verified.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Connect API" open={open} onClose={onClose}>
      <div className="form-stack">
        <div className="notice neutral">Your key is sent only to this app server and the selected AI provider. It is not included in page HTML or logs by this project.</div>
        <label className="field"><span>API key</span><input type="password" value={apiKey} onChange={(e) => updateKey(e.target.value)} autoComplete="off" placeholder="Paste your provider API key" /></label>
        <label className="field"><span>Provider {autoDetected && <em>auto-detected</em>}</span><select value={provider} onChange={(e) => { setProvider(e.target.value as CloudProvider); setAutoDetected(false); }}>{providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="checkbox-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>Remember this key on this device</span></label>
        {!remember && <p className="helper">Session-only is safer. Closing the browser session removes the key.</p>}
        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions split">{credential ? <button className="danger-button" onClick={() => { onDisconnect(); onClose(); }}>Remove saved key</button> : <span />}<div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={connect} disabled={loading}>{loading ? `Connecting to ${providerLabel(provider)}…` : `Connect ${providerLabel(provider)}`}</button></div></div>
      </div>
    </Modal>
  );
}
