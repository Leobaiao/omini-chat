import React, { useEffect, useState } from "react";
import { Edit2, Trash2 } from "lucide-react";
import agentsIcon from "./assets/agents.svg";

import { api } from "./lib/api";
import type { User, Role } from "../../shared/types";

interface Props {
    token: string;
    onBack: () => void;
}

export function Users({ token, onBack }: Props) {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Form states
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("AGENT");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        setLoading(true);
        try {
            const res = await api.get<User[]>("/api/users");
            setUsers(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMsg("");
        try {
            const method = editingUser ? "put" : "post";
            const url = editingUser ? `/api/users/${editingUser.UserId}` : `/api/users`;

            const payload: any = { name, email, role };
            if (password || !editingUser) {
                payload.password = password; // Only send if updating, or if it's a new user
            }

            await api[method](url, payload);

            setMsg(editingUser ? "✅ Usuário atualizado com sucesso!" : "✅ Usuário criado com sucesso!");
            closeModal();
            loadUsers();
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message;
            setMsg("❌ " + errorMsg);
        }
    }

    function openEdit(u: User) {
        setEditingUser(u);
        setName(u.Name || "");
        setEmail(u.Email);
        setRole(u.Role);
        setPassword("");
        setShowModal(true);
    }

    function openCreate() {
        setEditingUser(null);
        setName("");
        setEmail("");
        setRole("AGENT");
        setPassword("");
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingUser(null);
    }

    async function handleDelete(id: string) {
        if (!confirm("Tem certeza que deseja desativar este usuário?")) return;
        try {
            await api.delete(`/api/users/${id}`);
            loadUsers();
        } catch (e) {
            console.error(e);
        }
    }

    return (
        <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "1.2rem", cursor: "pointer", marginRight: 10 }}>←</button>
                <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img src={agentsIcon} alt="" style={{ width: 24, height: 24, filter: "invert(1)" }} />
                    Gerenciamento de Usuários
                </h2>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={openCreate}>+ Novo Usuário</button>
            </div>

            {msg && <div style={{ padding: 10, background: "#333", color: "white", marginBottom: 10, borderRadius: 5 }}>{msg}</div>}

            <div className="table-container" style={{ background: "var(--bg-secondary)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}>
                            <th style={{ padding: 15, textAlign: "left" }}>Nome (Agente)</th>
                            <th style={{ padding: 15, textAlign: "left" }}>Email</th>
                            <th style={{ padding: 15, textAlign: "left" }}>Função</th>
                            <th style={{ padding: 15, textAlign: "left" }}>Status</th>
                            <th style={{ padding: 15, textAlign: "right" }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center" }}>Carregando...</td></tr>}
                        {!loading && users.map(u => (
                            <tr key={u.UserId} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: 15 }}>
                                    <div style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                                        {u.Name || "Sem Nome"} {u.Role === "SUPERADMIN" && <span style={{ fontSize: "0.7em", background: "#f39c12", color: "white", padding: "2px 6px", borderRadius: 4, marginLeft: 5 }}>S-ADM</span>}
                                    </div>
                                </td>
                                <td style={{ padding: 15 }}>{u.Email}</td>
                                <td style={{ padding: 15 }}>
                                    <span style={{
                                        padding: "2px 6px", borderRadius: 4, fontSize: "0.8em",
                                        background: u.Role === "ADMIN" ? "#d942f5" : "#00a884", color: "white"
                                    }}>
                                        {u.Role}
                                    </span>
                                </td>
                                <td style={{ padding: 15 }}>{u.IsActive ? "🟢 Ativo" : "🔴 Inativo"}</td>
                                <td style={{ padding: 15, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                    {u.IsActive && (
                                        <>
                                            <button onClick={() => openEdit(u)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }} title="Editar">
                                                <Edit2 size={18} />
                                            </button>
                                            <button onClick={() => handleDelete(u.UserId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ea4335" }} title="Desativar">
                                                <Trash2 size={18} />
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
                }}>
                    <div style={{ background: "var(--bg-secondary)", padding: 25, borderRadius: 10, width: 400 }}>
                        <h3 style={{ marginTop: 0, marginBottom: 20 }}>{editingUser ? "Editar Usuário" : "Novo Usuário"}</h3>
                        <form onSubmit={handleSubmit}>
                            <div className="field" style={{ marginBottom: 15 }}>
                                <label style={{ display: "block", marginBottom: 5 }}>Nome do Agente</label>
                                <input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }} />
                            </div>
                            <div className="field" style={{ marginBottom: 15 }}>
                                <label style={{ display: "block", marginBottom: 5 }}>Email (Login)</label>
                                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@empresa.com" style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }} />
                            </div>
                            <div className="field" style={{ marginBottom: 15 }}>
                                <label style={{ display: "block", marginBottom: 5 }}>Senha</label>
                                <input required={!editingUser} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={editingUser ? "Deixe em branco p/ não alterar" : "******"} style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }} />
                            </div>
                            <div className="field" style={{ marginBottom: 15 }}>
                                <label style={{ display: "block", marginBottom: 5 }}>Função</label>
                                <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 5, background: "var(--bg-primary)", color: "white", border: "1px solid var(--border)" }}>
                                    <option value="AGENT">Agente</option>
                                    <option value="ADMIN">Administrador</option>
                                </select>
                            </div>

                            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                                <button type="button" onClick={closeModal} style={{ flex: 1, padding: 10, background: "transparent", border: "1px solid var(--border)", color: "white", borderRadius: 5, cursor: "pointer" }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editingUser ? "Salvar" : "Criar"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
