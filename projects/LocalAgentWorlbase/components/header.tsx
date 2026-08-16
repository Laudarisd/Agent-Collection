"use client";

import type { ModelDescriptor, ProviderKind } from "@/lib/types";
import { ChevronDownIcon, CpuIcon, KeyIcon, MenuIcon, SettingsIcon } from "@/components/ui/icons";
import { useState } from "react";

function providerName(provider: ProviderKind | null): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Claude";
  if (provider === "gemini") return "Gemini";
  if (provider === "ollama") return "Ollama";
  if (provider === "llamacpp") return "llama.cpp";
  return "No provider";
}

export function Header({
  provider,
  model,
  models,
  onModelChange,
  onMenu,
  onApiKey,
  onLocalModel,
  onSettings,
}: {
  provider: ProviderKind | null;
  model: string;
  models: ModelDescriptor[];
  onModelChange: (model: string) => void;
  onMenu: () => void;
  onApiKey: () => void;
  onLocalModel: () => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = models.find((item) => item.id === model);

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="icon-button menu-trigger" onClick={onMenu} aria-label="Open sidebar"><MenuIcon /></button>
        <div className="model-picker-wrap">
          <button className="model-picker" onClick={() => setOpen(!open)}>
            <span className="model-provider">{providerName(provider)}</span>
            <span className="model-name">{current?.name || model || "Choose a model"}</span>
            <ChevronDownIcon size={16} />
          </button>
          {open && (
            <div className="model-menu">
              {models.length === 0 ? (
                <div className="model-menu-empty">Connect an API or local runtime first.</div>
              ) : models.map((item) => (
                <button key={`${item.provider}-${item.id}`} onClick={() => { onModelChange(item.id); setOpen(false); }} className={item.id === model ? "selected" : ""}>
                  <span>{item.name}</span>
                  {item.description && <small>{item.description}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="header-actions">
        <button className="header-action" onClick={onApiKey}><KeyIcon size={17} /><span>API Key</span></button>
        <button className="header-action" onClick={onLocalModel}><CpuIcon size={17} /><span>Local Model</span></button>
        <button className="icon-button settings-top" onClick={onSettings} aria-label="Settings"><SettingsIcon size={19} /></button>
      </div>
    </header>
  );
}
