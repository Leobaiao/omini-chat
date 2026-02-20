import React, { useState } from "react";

import { api } from "./lib/api";

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
    const [instances, setInstances] = useState<any[]>([]);
    const [selectedConnectorId, setSelectedConnectorId] = useState("");



    React.useEffect(() => {
        // Load configurations
        api.get("/api/settings").then(res => {
            const data = res.data;
            setDefaultProvider(data.defaultProvider || "GTI");
            if (data.instances && Array.isArray(data.instances)) {
                setInstances(data.instances);
                const active = data.instances.find((i: any) => i.Provider === data.defaultProvider);
                if (active) setSelectedConnectorId(active.ConnectorId);
                else if (data.instances.length > 0) setSelectedConnectorId(data.instances[0].ConnectorId);
            }
            if (data.config) {
                setInstanceId(data.config.instance || data.config.phoneNumberId || "");
                setTokenVal(data.config.token || data.config.accessToken || data.config.apiKey || "");
            }
        }).catch(err => {
            console.error("Erro ao carregar configurações:", err);
        });
    }, []);

    function handleInstanceChange(cId: string) {
        setSelectedConnectorId(cId);
        const inst = instances.find(i => i.ConnectorId === cId);
        if (inst) {
            setDefaultProvider(inst.Provider);
            setInstanceId(inst.config?.instance || inst.config?.phoneNumberId || "");
            setTokenVal(inst.config?.token || inst.config?.accessToken || inst.config?.apiKey || "");
        }
    }

    async function handleSave() {
        setLoading(true);
        setMsg("");
        try {
            // 1. Profile update
            if (password || avatar) {
                await api.put("/api/profile", { password: password || undefined, avatar: avatar || undefined });
            }

            // 2. Settings update
            await api.put("/api/settings", {
                defaultProvider,
                connectorId: selectedConnectorId,
                instanceId,
                token: tokenVal
            });

            setMsg("✅ Configurações atualizadas com sucesso!");
            setPassword("");
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message;
            setMsg("❌ Erro: " + errorMsg);
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

                {instances.length === 0 ? (
                    <div style={{ padding: 15, background: "rgba(234, 67, 53, 0.1)", color: "#ea4335", borderRadius: 8, marginBottom: 15 }}>
                        Nenhuma instância de conexão encontrada para essa empresa. Contate o Super Admin.
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ display: "block", marginBottom: 5, color: "var(--text-secondary)" }}>Instância Padrão</label>
                            <select
                                value={selectedConnectorId}
                                onChange={e => handleInstanceChange(e.target.value)}
                                style={{ width: "100%", padding: 10, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "white" }}
                            >
                                {instances.map(inst => (
                                    <option key={inst.ConnectorId} value={inst.ConnectorId}>
                                        {inst.ChannelName || 'Sem Nome'} ({inst.Provider})
                                    </option>
                                ))}
                            </select>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 5 }}>
                                Provider Mapeado: <strong>{defaultProvider}</strong>
                            </div>
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
                    </>
                )}
            </div>
        </div>
    );
}
