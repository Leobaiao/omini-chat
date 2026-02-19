import React, { useState } from "react";

const API = "http://localhost:3001";

interface Props {
    token: string;
    onBack: () => void;
}

export function Settings({ token, onBack }: Props) {
    const [password, setPassword] = useState("");
    const [avatar, setAvatar] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [defaultProvider, setDefaultProvider] = useState("GTI");
    const [instanceId, setInstanceId] = useState("");
    const [tokenVal, setTokenVal] = useState("");

    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    React.useEffect(() => {
        // Load configurations
        fetch(`${API}/api/settings`, { headers }).then(async r => {
            if (r.ok) {
                const data = await r.json();
                setDefaultProvider(data.defaultProvider || "GTI");
                if (data.config) {
                    setInstanceId(data.config.instance || data.config.phoneNumberId || "");
                    setTokenVal(data.config.token || data.config.accessToken || "");
                }
            }
        });
    }, []);

    async function handleSave() {
        setLoading(true);
        setMsg("");
        try {
            // 1. Profile update
            if (password || avatar) {
                const res = await fetch(`${API}/api/profile`, {
                    method: "PUT", headers,
                    body: JSON.stringify({ password: password || undefined, avatar: avatar || undefined })
                });
                if (!res.ok) throw new Error((await res.json()).error);
            }

            // 2. Settings update
            const res2 = await fetch(`${API}/api/settings`, {
                method: "PUT", headers,
                body: JSON.stringify({ defaultProvider, instanceId, token: tokenVal })
            });
            if (!res2.ok) throw new Error((await res2.json()).error);

            setMsg("✅ Configurações atualizadas com sucesso!");
            setPassword("");
        } catch (err: any) {
            setMsg("❌ Erro: " + err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "1.2rem", cursor: "pointer", marginRight: 10 }}>←</button>
                <h2>Configurações</h2>
            </div>

            <div style={{ maxWidth: 400, background: "var(--bg-secondary)", padding: 20, borderRadius: 10 }}>
                {msg && <div style={{ marginBottom: 15, padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 5 }}>{msg}</div>}

                <h3 style={{ fontSize: 16, marginBottom: 15, color: "var(--text-primary)" }}>Perfil</h3>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "var(--text-secondary)" }}>Nova Senha</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Deixe em branco para não alterar"
                        style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }}
                    />
                </div>

                <div style={{ marginBottom: 25 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "var(--text-secondary)" }}>URL do Avatar (Foto)</label>
                    <input
                        type="text"
                        value={avatar}
                        onChange={e => setAvatar(e.target.value)}
                        placeholder="https://..."
                        style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }}
                    />
                </div>

                <hr style={{ border: "0", borderTop: "1px solid var(--border)", marginBottom: 25 }} />

                <h3 style={{ fontSize: 16, marginBottom: 15, color: "var(--text-primary)" }}>Integração (Admin)</h3>
                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "var(--text-secondary)" }}>Adapter Padrão</label>
                    <select
                        value={defaultProvider}
                        onChange={e => setDefaultProvider(e.target.value)}
                        style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }}
                    >
                        <option value="GTI">GTI (uazapi)</option>
                        <option value="OFFICIAL">Official WhatsApp Cloud</option>
                        <option value="ZAPI">Z-API</option>
                        <option value="WARNING">WARNING (Debug)</option>
                    </select>
                </div>

                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "var(--text-secondary)" }}>Instance ID / Phone ID</label>
                    <input
                        type="text"
                        value={instanceId}
                        onChange={e => setInstanceId(e.target.value)}
                        placeholder="Ex: instance_12345"
                        style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }}
                    />
                </div>

                <div style={{ marginBottom: 15 }}>
                    <label style={{ display: "block", marginBottom: 5, color: "var(--text-secondary)" }}>Token / Access Token</label>
                    <input
                        type="password"
                        value={tokenVal}
                        onChange={e => setTokenVal(e.target.value)}
                        placeholder="Ex: abc-123-xyz"
                        style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }}
                    />
                </div>

                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                >
                    {loading ? "Salvando..." : "Salvar Alterações"}
                </button>
            </div>
        </div>
    );
}
