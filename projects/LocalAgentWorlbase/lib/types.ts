export type CloudProvider = "openai" | "anthropic" | "gemini";
export type LocalRuntime = "ollama" | "llamacpp";
export type ProviderKind = CloudProvider | LocalRuntime;
export type ThemeMode = "system" | "light" | "dark";

export type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  text?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  error?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  provider: ProviderKind | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ModelDescriptor = {
  id: string;
  name: string;
  provider: ProviderKind;
  description?: string;
  vision?: boolean;
  capabilities?: string[];
};

export type AppSettings = {
  theme: ThemeMode;
  systemPrompt: string;
  enterToSend: boolean;
};

export type LocalModelConfig = {
  runtime: LocalRuntime;
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export type CloudCredential = {
  provider: CloudProvider;
  apiKey: string;
  remember: boolean;
};

export type ChatRequest = {
  provider: ProviderKind;
  model: string;
  apiKey?: string;
  systemPrompt?: string;
  messages: ChatMessage[];
};
