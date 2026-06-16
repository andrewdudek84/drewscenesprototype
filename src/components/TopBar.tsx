import { useEffect, useRef, useState } from 'react';

export type Theme = 'dark' | 'light';

interface Props {
  sceneName: string;
  onSceneNameChange: (name: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export default function TopBar({
  sceneName,
  onSceneNameChange,
  onExport,
  onImport,
  theme,
  onThemeChange
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sceneName);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(sceneName);
  }, [sceneName, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Close the settings menu when clicking outside it or pressing Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (ev: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(ev.target as Node)) return;
      setMenuOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const commit = () => {
    const next = draft.trim() || sceneName;
    if (next !== sceneName) onSceneNameChange(next);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(sceneName);
    setEditing(false);
  };

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) onImport(f);
    // Reset so the same file can be re-imported later.
    e.target.value = '';
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Logo />
        <span className="brand-name">Drew Scenes Prototype V1.0</span>
      </div>
      <div className="topbar-center">
        {editing ? (
          <input
            ref={inputRef}
            className="scene-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') cancel();
            }}
            maxLength={120}
          />
        ) : (
          <button
            type="button"
            className="scene-title-btn"
            title="Click to rename scene"
            onClick={() => setEditing(true)}
          >
            <span className="scene-title-text">{sceneName}</span>
            <PencilIcon />
          </button>
        )}
      </div>
      <div className="topbar-right">
        <input
          ref={fileRef}
          type="file"
          accept=".usda,.usd,text/plain"
          style={{ display: 'none' }}
          onChange={onPickFile}
        />
        <button
          type="button"
          className="topbar-btn"
          onClick={() => fileRef.current?.click()}
          title="Import scene from .usda file"
        >
          <ImportIcon />
          <span>Import</span>
        </button>
        <button
          type="button"
          className="topbar-btn is-primary"
          onClick={onExport}
          title="Export scene as .usda file"
        >
          <ExportIcon />
          <span>Export</span>
        </button>
        <div className="topbar-menu" ref={menuRef}>
          <button
            type="button"
            className={`topbar-icon-btn${menuOpen ? ' is-open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            title="Settings"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <HamburgerIcon />
          </button>
          {menuOpen && (
            <div className="topbar-dropdown" role="menu">
              <div className="dropdown-section-label">Theme</div>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={theme === 'dark'}
                className={`dropdown-item${theme === 'dark' ? ' is-active' : ''}`}
                onClick={() => {
                  onThemeChange('dark');
                  setMenuOpen(false);
                }}
              >
                <MoonIcon />
                <span>Dark</span>
                {theme === 'dark' && <CheckIcon />}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={theme === 'light'}
                className={`dropdown-item${theme === 'light' ? ' is-active' : ''}`}
                onClick={() => {
                  onThemeChange('light');
                  setMenuOpen(false);
                }}
              >
                <SunIcon />
                <span>Light</span>
                {theme === 'light' && <CheckIcon />}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Logo() {
  // Cat face: rounded head with triangular ears, whisker pads, a small
  // triangular nose, and vertical slit pupils on green eyes.
  return (
    <svg
      viewBox="0 0 32 32"
      width="26"
      height="26"
      aria-hidden="true"
      className="brand-logo"
    >
      <defs>
        <linearGradient id="catFur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e7a8a" />
          <stop offset="1" stopColor="#3a4250" />
        </linearGradient>
      </defs>

      {/* Ears: triangular with pink inner ear. */}
      <path d="M5 12 L8 3 L13 10 Z" fill="url(#catFur)" stroke="#22272f" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M27 12 L24 3 L19 10 Z" fill="url(#catFur)" stroke="#22272f" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M7.5 10 L8.5 5.5 L11 9 Z" fill="#e58aa6" />
      <path d="M24.5 10 L23.5 5.5 L21 9 Z" fill="#e58aa6" />

      {/* Head: rounded with a slight chin taper. */}
      <path
        d="M16 7
           C 22 7, 26 11, 26 17
           C 26 21, 24 24, 21 26
           C 19.5 27, 17.5 27.5, 16 27.5
           C 14.5 27.5, 12.5 27, 11 26
           C 8 24, 6 21, 6 17
           C 6 11, 10 7, 16 7 Z"
        fill="url(#catFur)"
        stroke="#22272f"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />

      {/* Eyes: green almond with vertical slit pupils + small highlight. */}
      <path d="M9.5 16 C 10.5 14, 13.5 14, 14.5 16 C 13.5 18, 10.5 18, 9.5 16 Z" fill="#a8e063" />
      <path d="M17.5 16 C 18.5 14, 21.5 14, 22.5 16 C 21.5 18, 18.5 18, 17.5 16 Z" fill="#a8e063" />
      <ellipse cx="12" cy="16" rx="0.55" ry="1.7" fill="#0a0907" />
      <ellipse cx="20" cy="16" rx="0.55" ry="1.7" fill="#0a0907" />
      <circle cx="11.6" cy="15.4" r="0.3" fill="#f6f5f1" />
      <circle cx="19.6" cy="15.4" r="0.3" fill="#f6f5f1" />

      {/* Nose: small pink triangle. */}
      <path d="M15 19.5 L17 19.5 L16 21 Z" fill="#e58aa6" stroke="#a85f78" strokeWidth="0.3" strokeLinejoin="round" />

      {/* Mouth: classic cat "ω" with a dip under the nose. */}
      <path d="M16 21 L16 22.3" stroke="#0a0907" strokeWidth="0.6" strokeLinecap="round" />
      <path d="M16 22.3 Q 14.5 23.6, 13.5 22.6" fill="none" stroke="#0a0907" strokeWidth="0.6" strokeLinecap="round" />
      <path d="M16 22.3 Q 17.5 23.6, 18.5 22.6" fill="none" stroke="#0a0907" strokeWidth="0.6" strokeLinecap="round" />

      {/* Whiskers. */}
      <path d="M6 20 L13 20.5 M6.3 22 L13 21.5" stroke="#e7ecf3" strokeWidth="0.4" strokeLinecap="round" />
      <path d="M26 20 L19 20.5 M25.7 22 L19 21.5" stroke="#e7ecf3" strokeWidth="0.4" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20 L4 16 L16 4 L20 8 L8 20 Z" />
      <path d="M14 6 L18 10" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4 L12 15" />
      <path d="M7 11 L12 16 L17 11" />
      <path d="M5 20 L19 20" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16 L12 5" />
      <path d="M7 9 L12 4 L17 9" />
      <path d="M5 20 L19 20" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M4 7 L20 7" />
      <path d="M4 12 L20 12" />
      <path d="M4 17 L20 17" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 14.5 A8 8 0 1 1 9.5 4 A6 6 0 0 0 20 14.5 Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3 L12 5" />
      <path d="M12 19 L12 21" />
      <path d="M3 12 L5 12" />
      <path d="M19 12 L21 12" />
      <path d="M5.6 5.6 L7 7" />
      <path d="M17 17 L18.4 18.4" />
      <path d="M5.6 18.4 L7 17" />
      <path d="M17 7 L18.4 5.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="dropdown-check"
    >
      <path d="M5 12 L10 17 L19 7" />
    </svg>
  );
}
