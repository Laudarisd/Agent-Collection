"use client";

import { DEFAULT_LOCAL_CONFIG, DEFAULT_SETTINGS, STORAGE_KEYS } from "@/lib/constants";
import type { AppSettings, CloudCredential, Conversation, LocalModelConfig } from "@/lib/types";

const DB_NAME = "ai-workspace";
const DB_VERSION = 1;
const DB_STORE = "state";
const CONVERSATION_RECORD = "conversations";

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser storage."));
  });
}

async function readIndexed<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return fallback;
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? fallback);
      request.onerror = () => reject(request.error || new Error("Could not read browser storage."));
    });
  } finally {
    database.close();
  }
}

async function writeIndexed<T>(key: string, value: T): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save browser storage."));
      transaction.onabort = () => reject(transaction.error || new Error("Browser storage transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function loadConversations(): Promise<Conversation[]> {
  if (typeof window === "undefined") return [];
  try {
    const stored = await readIndexed<Conversation[]>(CONVERSATION_RECORD, []);
    if (stored.length) return stored;
  } catch {
    // Fall back to legacy localStorage below.
  }

  const legacy = readJson<Conversation[]>(window.localStorage, STORAGE_KEYS.conversations, []);
  if (legacy.length) {
    void writeIndexed(CONVERSATION_RECORD, legacy).catch(() => undefined);
    window.localStorage.removeItem(STORAGE_KEYS.conversations);
  }
  return legacy;
}

export async function saveConversations(items: Conversation[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await writeIndexed(CONVERSATION_RECORD, items);
  } catch (error) {
    console.warn("Conversation history could not be persisted.", error);
  }
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...readJson(window.localStorage, STORAGE_KEYS.settings, {}) };
}

export function saveSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  } catch (error) {
    console.warn("Settings could not be persisted.", error);
  }
}

export function loadLocalConfig(): LocalModelConfig {
  if (typeof window === "undefined") return DEFAULT_LOCAL_CONFIG;
  return { ...DEFAULT_LOCAL_CONFIG, ...readJson(window.localStorage, STORAGE_KEYS.localConfig, {}) };
}

export function saveLocalConfig(config: LocalModelConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.localConfig, JSON.stringify(config));
  } catch (error) {
    console.warn("Local model settings could not be persisted.", error);
  }
}

export function loadCloudCredential(): CloudCredential | null {
  if (typeof window === "undefined") return null;
  const session = readJson<CloudCredential | null>(window.sessionStorage, STORAGE_KEYS.cloudCredentialSession, null);
  if (session) return session;
  return readJson<CloudCredential | null>(window.localStorage, STORAGE_KEYS.cloudCredential, null);
}

export function saveCloudCredential(credential: CloudCredential): void {
  clearCloudCredential();
  const target = credential.remember ? window.localStorage : window.sessionStorage;
  const key = credential.remember ? STORAGE_KEYS.cloudCredential : STORAGE_KEYS.cloudCredentialSession;
  target.setItem(key, JSON.stringify(credential));
}

export function clearCloudCredential(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.cloudCredential);
  window.sessionStorage.removeItem(STORAGE_KEYS.cloudCredentialSession);
}
