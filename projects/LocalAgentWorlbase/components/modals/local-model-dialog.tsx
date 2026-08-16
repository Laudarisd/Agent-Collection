"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Modal } from "@/components/modals/modal";
import { discoverLocalModels } from "@/lib/local/providers";
import type { LocalModelConfig, LocalRuntime, ModelDescriptor } from "@/lib/types";

export function LocalModelDialog({
  open,
  initial,
  onClose,
  onSave,
  onDisconnect,
}: {
  open: boolean;
  initial: LocalModelConfig;
  onClose: () => void;
  onSave: (config: LocalModelConfig, models: ModelDescriptor[]) => void;
  onDisconnect: () => void;
}) {
  const [config, setConfig] = useState(initial);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setConfig(initial);
    setModels([]);
    setError("");
    setAttempted(false);
    setManualEntry(false);
    setPickedFile(null);
    void detect(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function changeRuntime(runtime: LocalRuntime) {
    setModels([]);
    setPickedFile(null);
    const next = {
      ...config,
      runtime,
      baseUrl: runtime === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:8080",
      model: "",
    };
    setConfig(next);
    void detect(next);
  }

  async function detect(target: LocalModelConfig = config) {
    setLoading(true);
    setError("");
    try {
      const found = await discoverLocalModels(target);
      if (!found.length) throw new Error("The runtime responded, but no models are available.");
      setModels(found);
      setConfig((current) => ({ ...current, model: current.model && found.some((item) => item.id === current.model) ? current.model : found[0].id }));
    } catch (cause) {
      setModels([]);
      setError(cause instanceof Error ? cause.message : "Could not connect to the local runtime.");
    } finally {
      setLoading(false);
      setAttempted(true);
    }
  }

  function pickLocalFile() {
    fileInputRef.current?.click();
  }

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPickedFile(file);
    setManualEntry(true);
    const guessedId = config.runtime === "llamacpp" ? file.name : file.name.replace(/\.(gguf|bin)$/i, "");
    setConfig((current) => ({ ...current, model: current.model || guessedId }));
  }

  return (
    <Modal title="Local Model" open={open} onClose={onClose}>
      <div className="form-stack">
        <div className="segmented">
          <button className={config.runtime === "ollama" ? "active" : ""} onClick={() => changeRuntime("ollama")}>Ollama</button>
          <button className={config.runtime === "llamacpp" ? "active" : ""} onClick={() => changeRuntime("llamacpp")}>llama.cpp</button>
        </div>
        <label className="field"><span>Runtime URL</span><input value={config.baseUrl} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} /></label>
        {config.runtime === "llamacpp" && <label className="field"><span>Runtime API key <em>optional</em></span><input type="password" value={config.apiKey || ""} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} placeholder="Only if llama-server was started with --api-key" /></label>}
        <button className="secondary-button full" onClick={() => detect()} disabled={loading}>{loading ? "Detecting models…" : "Detect models"}</button>
        {models.length > 0 && <label className="field"><span>Model</span><select value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })}>{models.map((item) => <option value={item.id} key={item.id}>{item.name}{item.vision ? " · Vision" : ""}</option>)}</select></label>}
        {error && <div className="notice error">{error}</div>}
        {!loading && attempted && models.length === 0 && (
          <div className="notice neutral small">
            No models were found automatically. Make sure {config.runtime === "ollama" ? "Ollama" : "llama-server"} is running at the runtime URL above, or set up a model manually below.
          </div>
        )}
        {!loading && (
          <div className="field">
            <button type="button" className="text-button" onClick={() => setManualEntry((value) => !value)}>
              {manualEntry ? "Hide manual setup" : "Set up manually / load from a local folder"}
            </button>
            {manualEntry && (
              <div className="form-stack">
                <button type="button" className="secondary-button full" onClick={pickLocalFile}>
                  {pickedFile ? `Selected: ${pickedFile.name}` : "Choose a model file from a local folder…"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gguf,.bin"
                  style={{ display: "none" }}
                  onChange={handleFileChosen}
                />
                {pickedFile && (
                  <div className="notice neutral small">
                    Browsers can&rsquo;t reveal a chosen file&rsquo;s full folder path for security reasons, so this app can&rsquo;t point the runtime at it automatically.{" "}
                    {config.runtime === "llamacpp"
                      ? <>Launch llama.cpp with that file&rsquo;s full path, e.g. <code>LLAMA_MODEL=/absolute/path/to/{pickedFile.name} ./scripts/start-llama.sh</code>, then detect again.</>
                      : <>Import it into Ollama, e.g. a Modelfile containing <code>FROM /absolute/path/to/{pickedFile.name}</code>, then run <code>ollama create your-model-name -f Modelfile</code> and detect again.</>}
                  </div>
                )}
                <label className="field">
                  <span>Model name / id</span>
                  <input
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    placeholder={config.runtime === "ollama" ? "e.g. llama3.1:8b" : "e.g. model-Q4_K_M.gguf"}
                  />
                </label>
              </div>
            )}
          </div>
        )}
        <div className="notice neutral small">
          {config.runtime === "llamacpp"
            ? "llama.cpp runs GGUF models on CPU or CPU/GPU hybrid. Vision GGUF models can use a matching multimodal projector. This app connects to the running llama-server; it does not execute model files inside the browser."
            : "Ollama manages local model files and exposes them through its local API. Vision-capable Ollama models can receive image attachments."}
        </div>
        <p className="helper">For a publicly deployed HTTPS app, browser security may require allowing the deployed origin in your local runtime. Self-hosting this UI on the same computer is the most reliable local-model setup.</p>
        <div className="modal-actions split">{initial.model ? <button className="danger-button" onClick={() => { onDisconnect(); onClose(); }}>Disconnect local model</button> : <span />}<div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => { if (!config.model) { setError("Detect and choose a model first."); return; } onSave(config, models); onClose(); }}>Use local model</button></div></div>
      </div>
    </Modal>
  );
}
