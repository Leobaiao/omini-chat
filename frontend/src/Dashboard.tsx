import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Stats = {
    open: number;
    resolved: number;
    queue: number;
    messagesToday: number;
};

export function Dashboard({ token, onBack }: { token: string; onBack: () => void }) {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API}/api/dashboard/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [token]);

    if (loading) return <div style={{ padding: 20, color: "white" }}>Carregando métricas...</div>;
    if (!stats) return <div style={{ padding: 20, color: "white" }}>Erro ao carregar dashboard.</div>;

    const cards = [
        { label: "Conversas Abertas", value: stats.open, color: "#00a884", icon: "💬" },
        { label: "Em Fila (Sem Agente)", value: stats.queue, color: "#f1c40f", icon: "⏳" },
        { label: "Resolvidas (Total)", value: stats.resolved, color: "#3498db", icon: "✅" },
        { label: "Mensagens (Hoje)", value: stats.messagesToday, color: "#9b59b6", icon: "📊" },
    ];

    return (
        <div style={{ padding: 20, color: "var(--text-primary)", overflowY: "auto", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "1.2rem", cursor: "pointer", marginRight: 10 }}>←</button>
                <h2>Dashboard</h2>
            </div>
            <p style={{ opacity: 0.7, marginBottom: 20 }}>Visão geral da operação</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
                {cards.map((c, i) => (
                    <div key={i} style={{
                        background: "var(--bg-secondary)",
                        padding: 20,
                        borderRadius: 10,
                        borderLeft: `5px solid ${c.color}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 15
                    }}>
                        <div style={{ fontSize: "2em", opacity: 0.8 }}>{c.icon}</div>
                        <div>
                            <div style={{ fontSize: "1.8em", fontWeight: "bold" }}>{c.value}</div>
                            <div style={{ opacity: 0.7, fontSize: "0.9em" }}>{c.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Future charts can go here */}
            {/* <div style={{ marginTop: 40, padding: 20, background: "var(--bg-secondary)", borderRadius: 10 }}>
                <h3>Atividade Recente</h3>
                <p>Gráfico de volume de mensagens (Em breve)</p>
            </div> */}
        </div>
    );
}
