"use client";

import { useRef, useState } from "react";
import { FileIcon, PaperclipIcon, SendIcon, StopIcon, CloseIcon } from "@/components/ui/icons";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/constants";
import type { Attachment } from "@/lib/types";

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "html", "css", "xml", "yaml", "yml", "toml", "ini", "log", "sql", "java", "cs", "cpp", "c", "h", "hpp", "go", "rs", "php", "rb", "sh", "ps1"]);

export function Composer({
  disabled,
  streaming,
  enterToSend,
  onSend,
  onStop,
}: {
  disabled?: boolean;
  streaming: boolean;
  enterToSend: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const remaining = MAX_ATTACHMENTS - attachments.length;
    const selected = Array.from(files).slice(0, remaining);
    const next: Attachment[] = [];
    let totalBytes = attachments.reduce((sum, item) => sum + item.size, 0);

    for (const file of selected) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} exceeds the 8 MB attachment limit.`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        setError("Attachments are limited to 8 MB total per message.");
        continue;
      }
      const id = crypto.randomUUID();
      if (SUPPORTED_IMAGE_TYPES.has(file.type)) {
        next.push({ id, name: file.name, mimeType: file.type, size: file.size, dataUrl: await readAsDataUrl(file) });
        totalBytes += file.size;
        continue;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
        next.push({ id, name: file.name, mimeType: file.type || "text/plain", size: file.size, text: await file.text() });
        totalBytes += file.size;
        continue;
      }
      setError(`${file.name} is not supported. Use PNG, JPEG, WebP, GIF, text, code, CSV, JSON, or Markdown.`);
    }
    setAttachments((current) => [...current, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    const value = text.trim();
    if ((!value && attachments.length === 0) || streaming) return;
    onSend(value, attachments);
    setText("");
    setAttachments([]);
    setError("");
  }

  return (
    <div className="composer-area">
      <div className="composer-shell">
        {attachments.length > 0 && (
          <div className="attachment-tray">
            {attachments.map((item) => (
              <div className="attachment-chip" key={item.id}>
                {item.mimeType.startsWith("image/") && item.dataUrl ? <img src={item.dataUrl} alt="" /> : <FileIcon size={18} />}
                <div><strong>{item.name}</strong><span>{formatBytes(item.size)}</span></div>
                <button onClick={() => setAttachments((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.name}`}><CloseIcon size={15} /></button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (enterToSend && event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={disabled ? "Connect an API or local model to start" : "Message LocalAgentWorlbase"}
          disabled={disabled}
        />
        <div className="composer-toolbar">
          <div>
            <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.toml,.ini,.log,.sql,.java,.cs,.cpp,.c,.h,.hpp,.go,.rs,.php,.rb,.sh,.ps1" onChange={(event) => handleFiles(event.target.files)} />
            <button className="composer-tool" onClick={() => fileRef.current?.click()} disabled={disabled || attachments.length >= MAX_ATTACHMENTS} aria-label="Attach file"><PaperclipIcon size={20} /></button>
          </div>
          {streaming ? (
            <button className="send-button" onClick={onStop} aria-label="Stop generation"><StopIcon size={18} /></button>
          ) : (
            <button className="send-button" onClick={submit} disabled={disabled || (!text.trim() && attachments.length === 0)} aria-label="Send message"><SendIcon size={18} /></button>
          )}
        </div>
      </div>
      {error && <div className="composer-error">{error}</div>}
      <div className="composer-note">AI can make mistakes. Verify important information.</div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
