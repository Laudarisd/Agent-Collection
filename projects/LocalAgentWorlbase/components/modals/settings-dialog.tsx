"use client";

import { Modal } from "@/components/modals/modal";
import { APP_NAME } from "@/lib/constants";
import type { AppSettings, ThemeMode } from "@/lib/types";

export function SettingsDialog({ open, settings, onClose, onChange }: { open: boolean; settings: AppSettings; onClose: () => void; onChange: (settings: AppSettings) => void }) {
  function setTheme(theme: ThemeMode) { onChange({ ...settings, theme }); }
  return (
    <Modal title="Settings" open={open} onClose={onClose} width="620px">
      <div className="settings-section">
        <h3>Appearance</h3>
        <div className="segmented three"><button className={settings.theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>System</button><button className={settings.theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button><button className={settings.theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button></div>
      </div>
      <div className="settings-section">
        <h3>Chat</h3>
        <label className="field"><span>System instruction</span><textarea rows={5} value={settings.systemPrompt} onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={settings.enterToSend} onChange={(e) => onChange({ ...settings, enterToSend: e.target.checked })} /><span>Press Enter to send</span></label>
      </div>
      <div className="settings-section about-box">
        <h3>About</h3>
        <p><strong>{APP_NAME}</strong> · Version 1.0.0</p>
        <p>Personal professional software. Cloud API usage is billed by the provider whose key you connect.</p>
        <a href="/license" target="_blank">View software license</a>
      </div>
    </Modal>
  );
}
