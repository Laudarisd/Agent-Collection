"use client";

import { useEffect, useRef, useState } from "react";
import { CopyIcon, EditIcon, FileIcon, RefreshIcon } from "@/components/ui/icons";
import { Markdown } from "@/components/markdown";
import type { ChatMessage, ProviderKind } from "@/lib/types";

export function ChatThread({
  messages,
  provider,
  model,
  streaming,
  onEditUser,
  onRegenerate,
}: {
  messages: ChatMessage[];
  provider: ProviderKind | null;
  model: string;
  streaming: boolean;
  onEditUser: (id: string, content: string) => void;
  onRegenerate: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" }); }, [messages, streaming]);

  if (messages.length === 0) {
    return (
      <div className="empty-chat">
        <div className="empty-logo">AI</div>
        <h1>How can I help?</h1>
        <p>{provider && model ? `${providerLabel(provider)} · ${model}` : "Connect an API key or local model from the top right to begin."}</p>
      </div>
    );
  }

  return (
    <div className="thread-scroll">
      <div className="thread">
        {messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            streaming={streaming && index === messages.length - 1 && message.role === "assistant"}
            onEdit={(value) => onEditUser(message.id, value)}
            onRegenerate={onRegenerate}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageRow({ message, isLast, streaming, onEdit, onRegenerate }: { message: ChatMessage; isLast: boolean; streaming: boolean; onEdit: (value: string) => void; onRegenerate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(message.content);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  if (message.role === "user") {
    return (
      <div className="message-row user-row">
        <div className="user-message-wrap">
          {message.attachments && message.attachments.length > 0 && <AttachmentView attachments={message.attachments} />}
          {editing ? (
            <div className="edit-box"><textarea value={value} onChange={(e) => setValue(e.target.value)} rows={Math.max(2, value.split("\n").length)} /><div><button className="secondary-button" onClick={() => { setValue(message.content); setEditing(false); }}>Cancel</button><button className="primary-button" onClick={() => { const next = value.trim(); if (next) onEdit(next); setEditing(false); }}>Save & submit</button></div></div>
          ) : (
            <div className="user-bubble">{message.content && <div className="user-content">{message.content}</div>}</div>
          )}
          {!editing && <div className="message-actions user-actions"><button onClick={copy}>{copied ? "Copied" : <><CopyIcon size={15} /> Copy</>}</button><button onClick={() => setEditing(true)}><EditIcon size={15} /> Edit</button></div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`message-row assistant-row ${message.error ? "has-error" : ""}`}>
      <div className="assistant-avatar">AI</div>
      <div className="assistant-body">
        {message.content ? <Markdown content={message.content} /> : streaming ? <div className="thinking-dots"><span /><span /><span /></div> : null}
        {!streaming && message.content && <div className="message-actions"><button onClick={copy}>{copied ? "Copied" : <><CopyIcon size={15} /> Copy</>}</button>{isLast && <button onClick={onRegenerate}><RefreshIcon size={15} /> Regenerate</button>}</div>}
      </div>
    </div>
  );
}

function AttachmentView({ attachments }: { attachments: NonNullable<ChatMessage["attachments"]> }) {
  return <div className="message-attachments">{attachments.map((item) => item.mimeType.startsWith("image/") && item.dataUrl ? <img key={item.id} src={item.dataUrl} alt={item.name} /> : <div className="message-file" key={item.id}><FileIcon size={18} /><span>{item.name}</span></div>)}</div>;
}

function providerLabel(provider: ProviderKind): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Claude";
  if (provider === "gemini") return "Gemini";
  if (provider === "ollama") return "Ollama";
  return "llama.cpp";
}
