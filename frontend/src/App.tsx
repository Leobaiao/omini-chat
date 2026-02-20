import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { CannedResponses } from "./CannedResponses";
import { QueueSettings } from "./QueueSettings";
import { Contacts } from "./Contacts";
import { Toast } from "./components/Toast";
import { EmojiPicker } from "./components/EmojiPicker";
import { TemplateModal } from "./components/TemplateModal";
import { AudioPlayer } from "./components/AudioPlayer";
import { Settings } from "./Settings";
import { Dashboard as DashboardView } from "./Dashboard";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const socket = io(API);

type Conversation = {
  ConversationId: string;
  Title: string;
  Status: string;
  Kind: string;
  LastMessageAt: string;
  ExternalUserId: string;
  UnreadCount: number;
  QueueId?: string;
  AssignedUserId?: string;
};

type Message = {
  MessageId: string;
  Body: string;
  Direction: "IN" | "OUT";
  SenderExternalId: string;
  MediaType?: "image" | "audio" | "video" | "document";
  MediaUrl?: string;
  Status?: "SENT" | "DELIVERED" | "READ" | "FAILED";
  CreatedAt: string;
};

type CannedResponse = {
  CannedResponseId: string;
  Shortcut: string;
  Content: string;
  Title: string;
};

// ─── Login ────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [tenantId, setTenantId] = useState("42D2AD5C-D9D1-4FF9-A285-7DD0CE4CDE5D");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro no login");
      localStorage.setItem("token", data.token);
      onLogin(data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>🟢 OmniChat</h1>
        <p>Faça login para acessar o painel de atendimento</p>

        {error && <div className="error">{error}</div>}

        <div className="field">
          <label>Tenant ID</label>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@teste.com" />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────
function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [view, setView] = useState<"CHAT" | "CANNED" | "QUEUES" | "CONTACTS" | "SETTINGS" | "DASHBOARD">("CHAT");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info"; action?: { label: string; onClick: () => void } } | null>(null);

  function showToast(message: string, type: "success" | "error" | "info" = "info", action?: { label: string; onClick: () => void }) {
    setToast({ message, type, action });
  }

  const inputs = useRef<HTMLInputElement>(null);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // Extract tenantId from JWT
  const decoded = parseJwt(token);
  const tenantId = decoded?.tenantId;

  // Load conversations
  useEffect(() => {
    if (!tenantId) return;
    fetch(`${API}/api/conversations`, { headers })
      .then((r) => {
        if (r.status === 401) {
          onLogout();
          throw new Error("Unauthorized");
        }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setConversations(data);
          if (data.length > 0 && !selectedConversationId) setSelectedConversationId(data[0].ConversationId);
        } else {
          console.error("API Error:", data);
        }
      })
      .catch(console.error);

    // Join tenant room for sidebar updates
    socket.emit("tenant:join", tenantId);

    const onConvUpdated = () => {
      fetch(`${API}/api/conversations`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setConversations(data);
        })
        .catch(console.error);
    };
    socket.on("conversation:updated", onConvUpdated);

    return () => {
      socket.emit("tenant:leave", tenantId);
      socket.off("conversation:updated", onConvUpdated);
    };
  }, [token, tenantId, selectedConversationId]);

  // Queue/Filter Logic
  const userId = decoded?.userId;

  const myChats = conversations.filter(c => c.Status === "OPEN" && ((c as any).AssignedUserId === userId || (!(c as any).QueueId && !(c as any).AssignedUserId)));
  const queueChats = conversations.filter(c => c.Status === "OPEN" && (c as any).QueueId && !(c as any).AssignedUserId);
  const resolvedChats = conversations.filter(c => c.Status === "RESOLVED");

  const [tab, setTab] = useState<"MY" | "QUEUE" | "RESOLVED">("MY");

  let displayedConversations = myChats;
  if (tab === "QUEUE") displayedConversations = queueChats;
  if (tab === "RESOLVED") displayedConversations = resolvedChats;

  // Load messages when active conversation changes
  useEffect(() => {
    if (!selectedConversationId) return;
    fetch(`${API}/api/conversations/${selectedConversationId}/messages`, { headers })
      .then((r) => r.json())
      .then(setMessages);

    socket.emit("conversation:join", selectedConversationId);

    // Global message listener handled here because we need `selectedConversationId` state
    // But since this effect re-runs when `selectedConversationId` changes, it's fine.
    const onNew = (m: any) => {
      // 1. If message is for THIS conversation, append it
      if (m.conversationId === selectedConversationId) {
        setMessages((prev) => [
          ...prev,
          {
            MessageId: crypto.randomUUID(),
            Body: m.text,
            Direction: m.direction ?? "IN",
            SenderExternalId: m.senderExternalId ?? "",
            MediaType: m.mediaType,
            MediaUrl: m.mediaUrl,
            CreatedAt: new Date().toISOString(),
          },
        ]);
      } else {
        // 2. If message is for ANOTHER conversation, show toast
        showToast(`Nova mensagem de ${m.senderExternalId}`, "success", {
          label: "Ver",
          onClick: () => {
            setSelectedConversationId(m.conversationId);
            setView("CHAT");
          }
        });
      }

      // 3. Always update sidebar preview
      setConversations((prev) =>
        prev.map((c) =>
          c.ConversationId === m.conversationId
            ? { ...c, LastMessageAt: new Date().toISOString(), UnreadCount: c.ConversationId === selectedConversationId ? 0 : (c.UnreadCount || 0) + 1 }
            : c
        )
      );
    };

    socket.on("message:new", onNew);
    return () => {
      socket.emit("conversation:leave", selectedConversationId);
      socket.off("message:new", onNew);
    };
  }, [selectedConversationId, headers]);

  // Canned Responses Logic
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [showCannedMenu, setShowCannedMenu] = useState(false);
  const [cannedFilter, setCannedFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      fetch(`${API}/api/canned-responses`, { headers })
        .then(r => r.json())
        .then(setCannedResponses)
        .catch(console.error);
    }
  }, [token]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

    if (val.startsWith("/")) {
      setShowCannedMenu(true);
      setCannedFilter(val.slice(1).toLowerCase());
    } else {
      setShowCannedMenu(false);
    }
  };

  const selectCanned = (content: string) => {
    setText(content);
    setShowCannedMenu(false);
    inputRef.current?.focus();
  };

  const filteredCanned = cannedResponses.filter(c =>
    c.Shortcut.toLowerCase().includes(cannedFilter) ||
    c.Title.toLowerCase().includes(cannedFilter)
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !showCannedMenu) {
      sendReply();
    }
  };

  // Auto-scroll
  const [showScrollButton, setShowScrollButton] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Emoji Picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Template Modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isBottom);
  };

  async function sendReply(contentOverride?: string) {
    const bodyText = contentOverride ?? text;
    if (!bodyText.trim() || !selectedConversationId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/conversations/${selectedConversationId}/reply`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: bodyText }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast("Erro ao enviar: " + (err.error ?? "desconhecido"), "error");
        return;
      }
      if (!contentOverride) setText("");
    } catch (err: any) {
      showToast("Erro: " + err.message, "error");
    } finally {
      setSending(false);
    }
  }

  const selectedConversation = conversations.find((c) => c.ConversationId === selectedConversationId);

  function formatTime(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  async function handleAssign(queueId: string | null, userId: string | null) {
    if (!selectedConversationId) return;
    await fetch(`${API}/api/conversations/${selectedConversationId}/assign`, {
      method: "POST",
      headers,
      body: JSON.stringify({ queueId, userId })
    });
    // Force refresh
    const res = await fetch(`${API}/api/conversations`, { headers });
    setConversations(await res.json());
    if (userId) setTab("MY"); // Switch to MY after pickup
  }

  async function handleStatus(status: "OPEN" | "RESOLVED") {
    if (!selectedConversationId) return;
    await fetch(`${API}/api/conversations/${selectedConversationId}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status })
    });
    // Force refresh
    const res = await fetch(`${API}/api/conversations`, { headers });
    setConversations(await res.json());
    if (status === "RESOLVED") setTab("RESOLVED");
    if (status === "OPEN") setTab("MY");
  }

  function formatPhone(ext: string) {
    if (!ext) return "";
    return ext.replace("@s.whatsapp.net", "");
  }

  const isMobileDetailOpen = view !== "CHAT" || !!selectedConversationId;

  return (
    <div className={`app-layout ${isMobileDetailOpen ? "mobile-detail-open" : ""}`}>
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Conversas</h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button onClick={() => setView("DASHBOARD")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }} title="Dashboard">📊</button>
            <button onClick={() => setView("CONTACTS")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }} title="Contatos">📖</button>
            <button onClick={() => setView("QUEUES")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }} title="Gestão de Filas">👥</button>
            <button onClick={() => setView("CANNED")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }} title="Respostas Rápidas">⚡</button>
          </div>
        </div>
        <p>Painel de atendimento</p>

        <div className="search-box">
          <input placeholder="Buscar conversa…" />
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #333", marginBottom: 10 }}>
          <button onClick={() => setTab("MY")} style={{ flex: 1, padding: 10, background: tab === "MY" ? "#2a3942" : "transparent", border: "none", color: "white", cursor: "pointer", borderBottom: tab === "MY" ? "2px solid #00a884" : "none" }}>Minhas</button>
          <button onClick={() => setTab("QUEUE")} style={{ flex: 1, padding: 10, background: tab === "QUEUE" ? "#2a3942" : "transparent", border: "none", color: "white", cursor: "pointer", borderBottom: tab === "QUEUE" ? "2px solid #00a884" : "none" }}>Filas</button>
          <button onClick={() => setTab("RESOLVED")} style={{ flex: 1, padding: 10, background: tab === "RESOLVED" ? "#2a3942" : "transparent", border: "none", color: "white", cursor: "pointer", borderBottom: tab === "RESOLVED" ? "2px solid #00a884" : "none" }}>✔️</button>
        </div>

        <div className="conversation-list">
          {displayedConversations.map((c) => (
            <div
              key={c.ConversationId}
              className={`conversation-item ${c.ConversationId === selectedConversationId ? "active" : ""}`}
              onClick={() => setSelectedConversationId(c.ConversationId)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="title">{c.Title || formatPhone(c.ExternalUserId)}</span>
                <span className={`badge ${c.Status === "OPEN" ? "badge-open" : "badge-closed"}`}>
                  {c.Status}
                </span>
              </div>
              <div className="meta">
                <span className="preview">{formatPhone(c.ExternalUserId)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {c.UnreadCount > 0 && (
                    <span className="unread-badge">{c.UnreadCount}</span>
                  )}
                  <span className="time">{formatTime(c.LastMessageAt)}</span>
                </div>
              </div>
            </div>
          ))}
          {displayedConversations.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>
              Nenhuma conversa encontrada
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div style={{ padding: 10, borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <button onClick={() => setView("SETTINGS")} style={{ flex: 1, padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", cursor: "pointer" }}>
            ⚙️ Config
          </button>
          <button onClick={onLogout} style={{ width: 40, padding: 10, background: "var(--danger)", border: "none", borderRadius: 8, color: "white", cursor: "pointer" }} title="Sair">
            🚪
          </button>
        </div>
      </div>

      {/* Chat */}
      <div className="chat-area">
        {view === "CONTACTS" ? (
          <Contacts
            onBack={() => setView("CHAT")}
            onStartChat={async (c: any) => {
              try {
                const res = await fetch(`${API}/api/conversations`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ phone: c.Phone, name: c.Name })
                });
                if (!res.ok) throw new Error((await res.json()).error);
                const data = await res.json();
                setSelectedConversationId(data.conversationId);
                setView("CHAT");
              } catch (e: any) {
                showToast("Erro ao iniciar conversa: " + e.message, "error");
              }
            }}
          />
        ) : view === "SETTINGS" ? (
          <Settings token={token} onBack={() => setView("CHAT")} />
        ) : view === "DASHBOARD" ? (
          <DashboardView token={token} onBack={() => setView("CHAT")} />
        ) : view === "QUEUES" ? (
          <QueueSettings onBack={() => setView("CHAT")} />
        ) : view === "CANNED" ? (
          <CannedResponses onBack={() => setView("CHAT")} />
        ) : !selectedConversation ? (
          <div className="no-chat-selected">
            <div className="icon">💬</div>
            <p>Selecione uma conversa para começar</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div className="info" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="mobile-back-btn" onClick={() => setSelectedConversationId(null)}>
                  ←
                </button>
                <div>
                  <h2>{selectedConversation.Title || formatPhone(selectedConversation.ExternalUserId)}</h2>
                  <p>{formatPhone(selectedConversation.ExternalUserId)} • {selectedConversation.Kind} • {selectedConversation.Status}</p>
                </div>
              </div>
              <div className="actions" style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={async () => {
                    if (!confirm("Tem certeza que deseja apagar esta conversa e todo o histórico?")) return;
                    try {
                      await fetch(`${API}/api/conversations/${selectedConversationId}`, { method: "DELETE", headers });
                      showToast("Conversa apagada", "success");
                      // Refresh
                      const res = await fetch(`${API}/api/conversations`, { headers });
                      const data = await res.json();
                      setConversations(data);
                      setSelectedConversationId(null);
                    } catch (e: any) {
                      showToast("Erro: " + e.message, "error");
                    }
                  }}
                  className="icon-btn"
                  title="Apagar Conversa"
                  style={{ color: "#ea4335" }}
                >
                  🗑️
                </button>
                {selectedConversation.Status === "OPEN" && (
                  <button onClick={() => handleStatus("RESOLVED")} style={{ padding: "5px 10px", background: "#f0f2f5", border: "none", color: "green", borderRadius: 5, cursor: "pointer" }} title="Resolver">
                    ✅ Resolver
                  </button>
                )}
                {selectedConversation.Status === "RESOLVED" && (
                  <button onClick={() => handleStatus("OPEN")} style={{ padding: "5px 10px", background: "#f0f2f5", border: "none", color: "orange", borderRadius: 5, cursor: "pointer" }} title="Reabrir">
                    🔄 Reabrir
                  </button>
                )}

                {/* Se está na fila e não é meu, posso pegar */}
                {!selectedConversation.AssignedUserId && selectedConversation.QueueId && (
                  <button onClick={() => handleAssign(null, userId)} style={{ padding: "5px 10px", background: "#00a884", border: "none", color: "white", borderRadius: 5, cursor: "pointer" }}>
                    Pegar Atendimento
                  </button>
                )}
                {/* Se é meu, posso devolver para fila (mock: devolve para fila null ou primeira fila) */}
                {selectedConversation.AssignedUserId === userId && (
                  <button onClick={() => {
                    const qName = prompt("Para qual fila enviar? (Deixe vazio para soltar)");
                    // MVP simplificado: se vazio, solta na fila geral (QueueId=null). Se nome, teria que buscar ID.
                    // Vamos apenas soltar na fila geral por enquanto ou criar um menu melhor depois.
                    if (confirm("Devolver para a fila geral?")) handleAssign(null, null);
                  }} style={{ padding: "5px 10px", background: "#f0f2f5", border: "none", color: "#54656f", borderRadius: 5, cursor: "pointer", marginLeft: 10 }}>
                    Devolver
                  </button>
                )}

                {/* Reassign Connector (Admin only, hidden but useful for debug/migration) */}
                <button
                  onClick={async () => {
                    if (!confirm("Deseja re-conectar esta conversa ao Provider Padrão do sistema?")) return;
                    try {
                      const res = await fetch(`${API}/api/conversations/${selectedConversationId}/reassign-connector`, {
                        method: "POST", headers
                      });
                      const data = await res.json();
                      if (res.ok) {
                        alert("Conectado ao provider: " + data.provider);
                      } else {
                        alert("Erro: " + data.error);
                      }
                    } catch (e: any) { alert("Erro: " + e.message); }
                  }}
                  style={{ padding: "5px 10px", background: "#f0f2f5", border: "none", color: "#666", borderRadius: 5, cursor: "pointer", marginLeft: 10, fontSize: "0.8rem" }}
                  title="Trocar para Provider Padrão"
                >
                  ⚡
                </button>
              </div>
            </div>

            <div className="chat-messages" ref={chatContainerRef} onScroll={handleScroll}>
              {messages.map((m) => (
                <div key={m.MessageId} className={`bubble-row ${m.Direction === "OUT" ? "out" : "in"}`}>
                  <div className="bubble">
                    {m.Direction === "IN" && (
                      <div className="sender">{formatPhone(m.SenderExternalId) || "Cliente"}</div>
                    )}
                    {m.Direction === "OUT" && <div className="sender" style={{ color: "#8bb8a8" }}>Agente</div>}

                    {m.MediaType === "image" && m.MediaUrl && (
                      <div className="media-attachment">
                        <img src={m.MediaUrl} alt="Imagem" style={{ maxWidth: "100%", borderRadius: 8, marginTop: 4 }} />
                      </div>
                    )}
                    {m.MediaType === "audio" && m.MediaUrl && (
                      <div className="media-attachment">
                        <AudioPlayer src={m.MediaUrl} />
                      </div>
                    )}
                    {m.MediaType === "video" && m.MediaUrl && (
                      <div className="media-attachment">
                        <video controls src={m.MediaUrl} style={{ maxWidth: "100%", borderRadius: 8, marginTop: 4 }} />
                      </div>
                    )}
                    {m.MediaType === "document" && m.MediaUrl && (
                      <div className="media-attachment" style={{ marginTop: 4 }}>
                        <a href={m.MediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                          📄 Arquivo ({m.Body})
                        </a>
                      </div>
                    )}

                    <div className="text">{m.Body}</div>
                    <div className="timestamp">
                      {formatTime(m.CreatedAt)}
                      {m.Direction === "OUT" && (
                        <span style={{ marginLeft: 4, fontSize: '1.2em' }} title={m.Status}>
                          {m.Status === "READ" ? <span style={{ color: "#53bdeb" }}>✓✓</span> : m.Status === "DELIVERED" ? "✓✓" : m.Status === "SENT" ? "✓" : "🕒"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {showScrollButton && (
              <button
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                style={{
                  position: "absolute",
                  bottom: 80,
                  right: 20,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: "#202c33",
                  color: "#00a884",
                  border: "1px solid #333",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
                  zIndex: 100
                }}
              >
                ↓
              </button>
            )}

            <div className="chat-input-bar" style={{ position: "relative" }}>
              {showEmojiPicker && (
                <div style={{ position: "absolute", bottom: "60px", left: "0" }}>
                  <EmojiPicker onSelect={(emoji) => setText(prev => prev + emoji)} onClose={() => setShowEmojiPicker(false)} />
                </div>
              )}

              {showCannedMenu && (
                <div className="canned-menu" style={{ position: "absolute", bottom: 60, left: 20, background: "#202c33", border: "1px solid #333", borderRadius: 8, maxHeight: 200, overflowY: "auto", width: 300, zIndex: 10 }}>
                  {filteredCanned.length === 0 && <div style={{ padding: 10, color: "#888" }}>Nenhuma resposta encontrada</div>}
                  {filteredCanned.map(c => (
                    <div
                      key={c.CannedResponseId}
                      onClick={() => selectCanned(c.Content)}
                      style={{ padding: "10px", cursor: "pointer", borderBottom: "1px solid #333", display: "flex", flexDirection: "column" }}
                      className="canned-item"
                    >
                      <div style={{ fontWeight: "bold", color: "#00a884" }}>/{c.Shortcut} <span style={{ color: "#fff" }}>{c.Title}</span></div>
                      <div style={{ fontSize: "0.85em", color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.Content}</div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", padding: "0 10px" }} title="Emojis">
                😊
              </button>
              <button onClick={() => setShowTemplateModal(true)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", padding: "0 10px" }} title="Modelos (HSM)">
                📄
              </button>
              <input
                ref={inputRef}
                placeholder="Digite uma mensagem (ou / para respostas rápidas)"
                value={text}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
              />
              <button className="btn btn-primary" onClick={() => sendReply()} disabled={sending}>
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </>
        )}
      </div>
      {
        toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )
      }
      {
        showTemplateModal && token && (
          <TemplateModal
            token={token}
            onClose={() => setShowTemplateModal(false)}
            onSend={(txt) => sendReply(txt)}
          />
        )
      }
    </div >
  );
}

// Helper to safely parse JWT
function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    return null;
  }
}

// ─── App Root ─────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));

  // Validate token on load
  useEffect(() => {
    if (token) {
      const decoded = parseJwt(token);
      if (!decoded || !decoded.tenantId) {
        console.error("Invalid token, logging out");
        localStorage.removeItem("token");
        setToken(null);
      }
    }
  }, [token]);

  if (!token) return <LoginScreen onLogin={setToken} />;

  // Verify again before rendering Dashboard to prevent crash
  const decoded = parseJwt(token);
  if (!decoded) return null; // Wait for useEffect to clear it

  return <Dashboard token={token} onLogout={() => { localStorage.removeItem("token"); setToken(null); }} />;
}
