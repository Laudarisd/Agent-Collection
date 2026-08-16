"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ChatThread } from "@/components/chat-thread";
import { Composer } from "@/components/composer";
import { ApiKeyDialog } from "@/components/modals/api-key-dialog";
import { LocalModelDialog } from "@/components/modals/local-model-dialog";
import { SettingsDialog } from "@/components/modals/settings-dialog";
import { IntelligenceWorkspace } from "@/components/intelligence/workspace";
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SETTINGS } from "@/lib/constants";
import { discoverLocalModels, streamLocalChat } from "@/lib/local/providers";
import {
  clearCloudCredential,
  loadCloudCredential,
  loadConversations,
  loadLocalConfig,
  loadSettings,
  saveCloudCredential,
  saveConversations,
  saveLocalConfig,
  saveSettings,
} from "@/lib/storage";
import type { Brand, WorkspaceView } from "@/lib/intelligence/types";
import type {
  AppSettings,
  Attachment,
  ChatMessage,
  CloudCredential,
  Conversation,
  LocalModelConfig,
  ModelDescriptor,
  ProviderKind,
} from "@/lib/types";

export function AppShell() {
  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [credential, setCredential] = useState<CloudCredential | null>(null);
  const [localConfig, setLocalConfig] = useState<LocalModelConfig>(DEFAULT_LOCAL_CONFIG);
  const [provider, setProvider] = useState<ProviderKind | null>(null);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [model, setModel] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiDialog, setApiDialog] = useState(false);
  const [localDialog, setLocalDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [view, setView] = useState<WorkspaceView>("chat");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [databaseError, setDatabaseError] = useState("");

  const active = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [conversations, activeId]);

  useEffect(() => {
    let cancelled = false;
    const storedSettings = loadSettings();
    const storedCredential = loadCloudCredential();
    const storedLocal = loadLocalConfig();
    setSettings(storedSettings);
    setCredential(storedCredential);
    setLocalConfig(storedLocal);
    void loadConversations().then((storedConversations) => {
      if (cancelled) return;
      setConversations(storedConversations);
      setActiveId(storedConversations[0]?.id ?? null);
      setHydrated(true);

      const latest = storedConversations[0];
      if (latest?.provider && latest.model) {
        void restoreProvider(latest.provider, latest.model, storedCredential, storedLocal);
      } else if (storedCredential) {
        void connectStoredCloud(storedCredential);
      } else if (storedLocal.model) {
        void connectStoredLocal(storedLocal);
      }
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reloadBrands();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeBrandId) window.localStorage.setItem("ai-workspace.active-brand.v1", activeBrandId);
    else window.localStorage.removeItem("ai-workspace.active-brand.v1");
  }, [activeBrandId]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveConversations(conversations);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveSettings(settings);
    if (settings.theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings, hydrated]);

  async function reloadBrands() {
    try {
      const response = await fetch("/api/brands", { cache: "no-store" });
      const text = await response.text();
      let data: { brands?: Brand[]; error?: string } = {};
      try { data = text ? JSON.parse(text) as typeof data : {}; } catch { /* Preserve HTTP fallback below. */ }
      if (!response.ok) throw new Error(data.error || text || `Unable to load brands (${response.status}).`);
      const next = data.brands ?? [];
      setBrands(next);
      setDatabaseError("");
      setActiveBrandId((current) => {
        if (current && next.some((brand) => brand.id === current)) return current;
        const stored = typeof window !== "undefined" ? window.localStorage.getItem("ai-workspace.active-brand.v1") : null;
        if (stored && next.some((brand) => brand.id === stored)) return stored;
        return next[0]?.id ?? null;
      });
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : "Unable to load the intelligence database.");
    }
  }

  async function restoreProvider(kind: ProviderKind, desiredModel: string, storedCredential: CloudCredential | null, storedLocal: LocalModelConfig) {
    if (isCloud(kind) && storedCredential?.provider === kind) {
      await connectStoredCloud(storedCredential, desiredModel);
      return;
    }
    if (!isCloud(kind) && storedLocal.runtime === kind && storedLocal.model) {
      await connectStoredLocal({ ...storedLocal, model: desiredModel || storedLocal.model }, desiredModel);
      return;
    }
    setProvider(kind);
    setModel(desiredModel);
    setModels([]);
  }

  async function connectStoredCloud(stored: CloudCredential, desiredModel?: string) {
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: stored.provider, apiKey: stored.apiKey }),
      });
      const data = (await response.json()) as { models?: ModelDescriptor[] };
      if (!response.ok || !data.models) return;
      setCredential(stored);
      setProvider(stored.provider);
      setModels(data.models);
      setModel(selectModel(stored.provider, data.models, desiredModel));
    } catch {
      // Keep the saved credential; the user can reconnect from the API dialog.
    }
  }

  async function connectStoredLocal(stored: LocalModelConfig, desiredModel?: string) {
    try {
      const found = await discoverLocalModels(stored);
      setLocalConfig(stored);
      setProvider(stored.runtime);
      setModels(found);
      setModel(selectModel(stored.runtime, found, desiredModel || stored.model));
    } catch {
      setProvider(stored.runtime);
      setModel(desiredModel || stored.model);
      setModels([]);
    }
  }

  function newChat() {
    if (streaming) abortController?.abort();
    setActiveId(null);
    setView("chat");
    setSidebarOpen(false);
  }

  function selectConversation(id: string) {
    const conversation = conversations.find((item) => item.id === id);
    setActiveId(id);
    setView("chat");
    if (conversation?.provider && conversation.model) {
      void restoreProvider(conversation.provider, conversation.model, credential, localConfig);
    }
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const next = current.filter((item) => item.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  function renameConversation(id: string, title: string) {
    setConversations((current) => current.map((item) => item.id === id ? { ...item, title, updatedAt: new Date().toISOString() } : item));
  }

  function saveCloudConnection(nextCredential: CloudCredential, nextModels: ModelDescriptor[]) {
    saveCloudCredential(nextCredential);
    setCredential(nextCredential);
    setProvider(nextCredential.provider);
    setModels(nextModels);
    setModel(selectModel(nextCredential.provider, nextModels));
  }

  function saveLocalConnection(nextConfig: LocalModelConfig, nextModels: ModelDescriptor[]) {
    saveLocalConfig(nextConfig);
    setLocalConfig(nextConfig);
    setProvider(nextConfig.runtime);
    setModels(nextModels);
    setModel(selectModel(nextConfig.runtime, nextModels, nextConfig.model));
  }


  function disconnectCloud() {
    clearCloudCredential();
    setCredential(null);
    if (provider && isCloud(provider)) {
      setProvider(null);
      setModels([]);
      setModel("");
    }
  }

  function disconnectLocal() {
    const reset = DEFAULT_LOCAL_CONFIG;
    saveLocalConfig(reset);
    setLocalConfig(reset);
    if (provider === "ollama" || provider === "llamacpp") {
      setProvider(null);
      setModels([]);
      setModel("");
    }
  }

  async function sendMessage(content: string, attachments: Attachment[]) {
    if (!provider || !model) {
      setApiDialog(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      attachments: attachments.length ? attachments : undefined,
      createdAt: new Date().toISOString(),
    };

    let conversationId = activeId;
    let baseMessages: ChatMessage[];
    if (!conversationId || !active) {
      conversationId = crypto.randomUUID();
      const now = new Date().toISOString();
      const conversation: Conversation = {
        id: conversationId,
        title: deriveTitle(content, attachments),
        messages: [userMessage],
        provider,
        model,
        createdAt: now,
        updatedAt: now,
      };
      setConversations((current) => [conversation, ...current]);
      setActiveId(conversationId);
      baseMessages = [userMessage];
    } else {
      baseMessages = [...active.messages, userMessage];
      setConversations((current) => current.map((item) => item.id === conversationId ? {
        ...item,
        messages: baseMessages,
        provider,
        model,
        title: item.messages.length === 0 ? deriveTitle(content, attachments) : item.title,
        updatedAt: new Date().toISOString(),
      } : item));
    }

    await runGeneration(conversationId, baseMessages, provider, model);
  }

  async function runGeneration(conversationId: string, baseMessages: ChatMessage[], generationProvider: ProviderKind, generationModel: string) {
    if (streaming) return;
    const assistantId = crypto.randomUUID();
    const assistant: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setConversations((current) => current.map((item) => item.id === conversationId ? {
      ...item,
      messages: [...baseMessages, assistant],
      provider: generationProvider,
      model: generationModel,
      updatedAt: new Date().toISOString(),
    } : item));

    const controller = new AbortController();
    setAbortController(controller);
    setStreaming(true);
    let output = "";

    const append = (delta: string) => {
      output += delta;
      setConversations((current) => current.map((item) => item.id === conversationId ? {
        ...item,
        messages: item.messages.map((message) => message.id === assistantId ? { ...message, content: output } : message),
        updatedAt: new Date().toISOString(),
      } : item));
    };

    try {
      const cleanMessages = baseMessages.filter((message) => !message.error);
      const latestQuestion = [...cleanMessages].reverse().find((message) => message.role === "user")?.content || "";
      const intelligencePrompt = await loadIntelligencePrompt(activeBrandId, latestQuestion, controller.signal);
      const effectiveSystemPrompt = [settings.systemPrompt, intelligencePrompt].filter(Boolean).join("\n\n");
      if (isCloud(generationProvider)) {
        if (!credential || credential.provider !== generationProvider) {
          throw new Error(`Connect a ${generationProvider} API key before using this conversation.`);
        }
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: generationProvider,
            model: generationModel,
            apiKey: credential.apiKey,
            systemPrompt: effectiveSystemPrompt,
            messages: cleanMessages,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status}).`);
        if (!response.body) throw new Error("The provider returned an empty response.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          append(decoder.decode(value, { stream: true }));
        }
      } else {
        if (localConfig.runtime !== generationProvider) {
          throw new Error(`Connect the ${generationProvider} runtime before using this conversation.`);
        }
        await streamLocalChat({
          config: { ...localConfig, model: generationModel },
          systemPrompt: effectiveSystemPrompt,
          messages: cleanMessages,
          onDelta: append,
          signal: controller.signal,
        });
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        if (!output) append("Generation stopped.");
      } else {
        const message = cause instanceof Error ? cause.message : "The request failed.";
        setConversations((current) => current.map((item) => item.id === conversationId ? {
          ...item,
          messages: item.messages.map((entry) => entry.id === assistantId ? { ...entry, content: output || message, error: true } : entry),
          updatedAt: new Date().toISOString(),
        } : item));
      }
    } finally {
      setStreaming(false);
      setAbortController(null);
    }
  }

  function stopGeneration() {
    abortController?.abort();
  }

  function editUserMessage(id: string, content: string) {
    if (!active || !active.provider || !active.model || streaming) return;
    const index = active.messages.findIndex((item) => item.id === id);
    if (index < 0) return;
    const edited = active.messages.slice(0, index + 1).map((message) => message.id === id ? { ...message, content } : message);
    setConversations((current) => current.map((item) => item.id === active.id ? { ...item, messages: edited, updatedAt: new Date().toISOString() } : item));
    void runGeneration(active.id, edited, active.provider, active.model);
  }

  function regenerate() {
    if (!active || !active.provider || !active.model || streaming) return;
    const base = active.messages.at(-1)?.role === "assistant" ? active.messages.slice(0, -1) : active.messages;
    setConversations((current) => current.map((item) => item.id === active.id ? { ...item, messages: base } : item));
    void runGeneration(active.id, base, active.provider, active.model);
  }

  const displayMessages = active?.messages ?? [];

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={setView}
        onNew={newChat}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onSettings={() => setSettingsDialog(true)}
      />
      <main className="main-panel">
        <Header
          provider={provider}
          model={model}
          models={models}
          onModelChange={setModel}
          onMenu={() => setSidebarOpen(true)}
          onApiKey={() => setApiDialog(true)}
          onLocalModel={() => setLocalDialog(true)}
          onSettings={() => setSettingsDialog(true)}
        />
        {view === "chat" ? <>
          <ChatThread messages={displayMessages} provider={provider} model={model} streaming={streaming} onEditUser={editUserMessage} onRegenerate={regenerate} />
          <Composer disabled={!provider || !model} streaming={streaming} enterToSend={settings.enterToSend} onSend={sendMessage} onStop={stopGeneration} />
        </> : <IntelligenceWorkspace
          view={view}
          brands={brands}
          activeBrandId={activeBrandId}
          databaseError={databaseError}
          onSelectBrand={setActiveBrandId}
          onReloadBrands={reloadBrands}
          onNavigate={setView}
        />}
      </main>

      <ApiKeyDialog open={apiDialog} credential={credential} onClose={() => setApiDialog(false)} onSave={saveCloudConnection} onDisconnect={disconnectCloud} />
      <LocalModelDialog open={localDialog} initial={localConfig} onClose={() => setLocalDialog(false)} onSave={saveLocalConnection} onDisconnect={disconnectLocal} />
      <SettingsDialog open={settingsDialog} settings={settings} onClose={() => setSettingsDialog(false)} onChange={setSettings} />
    </div>
  );
}

async function loadIntelligencePrompt(brandId: string | null, question: string, signal: AbortSignal): Promise<string> {
  if (!brandId) return "";
  try {
    const params = new URLSearchParams({ brandId, q: question.slice(0, 3000) });
    const response = await fetch(`/api/intelligence/context?${params.toString()}`, { cache: "no-store", signal });
    const data = await response.json() as { context?: string; error?: string };
    if (!response.ok) return `Private marketing intelligence was unavailable for this request (${data.error || response.status}). Do not claim facts from the private competitor database. Clearly separate general advice from observed evidence.`;
    return data.context || "";
  } catch (error) {
    if (signal.aborted) throw error;
    return "Private marketing intelligence could not be retrieved. Do not claim facts from the private competitor database; clearly label any general marketing guidance as general guidance.";
  }
}

function isCloud(provider: ProviderKind): provider is "openai" | "anthropic" | "gemini" {
  return provider === "openai" || provider === "anthropic" || provider === "gemini";
}

function deriveTitle(content: string, attachments: Attachment[]): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean) return clean.length > 48 ? `${clean.slice(0, 48).trim()}…` : clean;
  return attachments[0]?.name || "New chat";
}

function selectModel(provider: ProviderKind, models: ModelDescriptor[], desired?: string): string {
  if (desired && models.some((item) => item.id === desired)) return desired;
  const matchingProvider = models.find((item) => item.provider === provider);
  return matchingProvider?.id || models[0]?.id || desired || "";
}
