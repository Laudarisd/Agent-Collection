import type { AppSettings, LocalModelConfig } from "@/lib/types";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "LocalAgentWorlbase";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  systemPrompt: "You are a precise, helpful AI assistant. Be clear, practical, and honest about uncertainty.",
  enterToSend: true,
};

export const DEFAULT_LOCAL_CONFIG: LocalModelConfig = {
  runtime: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "",
};

export const STORAGE_KEYS = {
  conversations: "ai-workspace.conversations.v1",
  settings: "ai-workspace.settings.v1",
  localConfig: "ai-workspace.local-model.v1",
  cloudCredential: "ai-workspace.cloud-credential.v1",
  cloudCredentialSession: "ai-workspace.cloud-credential.session.v1",
} as const;

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;
export const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
