"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (content: string, isAi: boolean) => Promise<void>;
  disabled?: boolean;
  mcpAvailable?: boolean;
  mcpConnected?: boolean;
  availableMcpNames?: string[];
}

export function ChatInput({ onSend, disabled, mcpAvailable, mcpConnected, availableMcpNames = [] }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAiCmd = value.startsWith("/ai ");
  const isEmpty = !value.trim();

  const mentionOptions = mentionQuery !== null
    ? availableMcpNames.filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    autoResize();

    if (v.startsWith("/ai ")) {
      const cursor = e.target.selectionStart ?? v.length;
      const beforeCursor = v.slice(0, cursor);
      const atMatch = beforeCursor.match(/@(\S*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[1]);
        setMentionIndex(0);
      } else {
        setMentionQuery(null);
      }
    } else {
      setMentionQuery(null);
    }
  }

  function applyMention(name: string) {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const afterCursor = value.slice(cursor);
    const newBefore = beforeCursor.replace(/@(\S*)$/, `@${name} `);
    const newValue = newBefore + afterCursor;
    setValue(newValue);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = newBefore.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  async function handleSend() {
    if (isEmpty || sending) return;
    const content = value.trim();
    setValue("");
    setMentionQuery(null);
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setTimeout(() => textareaRef.current?.focus(), 0);  // 즉시 포커스 복귀
    // fire-and-forget: textarea를 블록하지 않고 바로 다음 입력 가능
    onSend(content, isAiCmd).catch(console.error).finally(() => setSending(false));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && mentionOptions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionOptions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); applyMention(mentionOptions[mentionIndex]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  useEffect(() => {
    function onClickOutside() { setMentionQuery(null); }
    if (mentionQuery !== null) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [mentionQuery]);

  return (
    <div style={{ padding: "14px 20px 32px", position: "relative" }}>
      {/* @멘션 드롭다운 */}
      {mentionQuery !== null && mentionOptions.length > 0 && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            bottom: "calc(100% - 14px)",
            left: 20, right: 20,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            zIndex: 50,
          }}
        >
          {mentionOptions.map((name, i) => (
            <button
              key={name}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); applyMention(name); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px",
                background: i === mentionIndex ? "var(--bg-hover)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(99,102,241,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "var(--accent)", flexShrink: 0,
              }}>@</span>
              <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{name}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>MCP</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          "flex items-center transition-all duration-200",
          isAiCmd
            ? "bg-[var(--bg-elevated)] border border-[var(--ai-border)]"
            : "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
        )}
        style={{
          gap: 12, borderRadius: 18, paddingLeft: 20, paddingRight: 12,
          boxShadow: isAiCmd ? "0 0 24px var(--accent-glow)" : "0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        {isAiCmd && (
          <div style={{ flexShrink: 0 }}>
            <div
              className="bg-[var(--accent)] flex items-center justify-center"
              style={{ width: 24, height: 24, borderRadius: 8, boxShadow: "0 0 10px var(--accent-glow)" }}
            >
              <Zap size={12} className="text-white" fill="white" />
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            mcpConnected
              ? "/ai [명령] 또는 메시지를 입력하세요..."
              : "/ai [질문] 또는 메시지를 입력하세요..."
          }
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 bg-transparent resize-none text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none leading-relaxed",
            "disabled:opacity-50"
          )}
          style={{ height: "auto", outline: "none", border: "none", padding: "14px 0", fontSize: 14, maxHeight: 160 }}
        />

        <button
          onClick={handleSend}
          disabled={isEmpty || sending || disabled}
          className={cn(
            "flex items-center justify-center shrink-0 transition-all duration-150 outline-none",
            isEmpty || disabled
              ? "text-[var(--text-muted)] cursor-not-allowed opacity-40"
              : isAiCmd
              ? "bg-[var(--accent)] text-white hover:opacity-90"
              : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
          style={{
            width: 36, height: 36, borderRadius: 12, flexShrink: 0,
            boxShadow: (!isEmpty && !disabled && isAiCmd) ? "0 0 14px var(--accent-glow)" : undefined,
          }}
        >
          {sending ? (
            <span className="border-2 border-current border-t-transparent rounded-full animate-spin" style={{ width: 14, height: 14 }} />
          ) : (
            <Send size={15} />
          )}
        </button>
      </div>

      {!isAiCmd && mcpAvailable && (
        <p className="text-[var(--text-muted)]" style={{ fontSize: 11, marginTop: 10, paddingLeft: 4 }}>
          <kbd className="font-mono bg-[var(--bg-elevated)] border border-[var(--border)]" style={{ borderRadius: 4, padding: "1px 5px" }}>/ai</kbd>
          {mcpConnected ? (
            <>
              {" "}로 시작하면 AI가 직접 코드를 수정해요
              {availableMcpNames.length > 1 && (
                <span style={{ marginLeft: 6 }}>
                  · <code style={{ color: "var(--accent)" }}>@이름</code>으로 MCP 지정 가능
                </span>
              )}
            </>
          ) : (
            <>
              {" "}로 시작하면 AI와 대화할 수 있어요
              <span style={{ marginLeft: 6 }}>· 파일 접근은 <span style={{ color: "var(--accent)" }}>MCP 연결</span> 후 가능해요</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
