import { useState, useEffect } from "react";

type Queue = {
    QueueId: string;
    Name: string;
    IsActive: boolean;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function QueueSettings({ onBack }: { onBack: () => void }) {
    const [items, setItems] = useState<Queue[]>([]);
    const [newName, setNewName] = useState("");
    const token = localStorage.getItem("token");

    useEffect(() => {
        fetch(`${API}/api/queues`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((res) => res.json())
            .then(setItems)
            .catch(console.error);
    }, []);

    const handleSave = async () => {
        if (!newName.trim()) return;
        const res = await fetch(`${API}/api/queues`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name: newName }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return alert("Erro ao criar fila: " + (err.error || res.statusText));
        }

        // reload
        const listRes = await fetch(`${API}/api/queues`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setItems(await listRes.json());
        setNewName("");
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Deletar fila?")) return;
        await fetch(`${API}/api/queues/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        setItems(items.filter((i) => i.QueueId !== id));
    };

    return (
        <div className="main-area" style={{ padding: 20 }}>
            <div className="header">
                <button onClick={onBack} style={{ marginRight: 10, background: "none", border: "none", color: "inherit", cursor: "pointer" }}>← Voltar</button>
                <h2>Gestão de Filas</h2>
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <input
                    placeholder="Nome da Fila (ex: Suporte)"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    style={{ padding: 10, borderRadius: 5, border: "none", flex: 1 }}
                />
                <button onClick={handleSave} style={{ padding: "10px 20px" }}>Criar</button>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
                {items.map((item) => (
                    <div key={item.QueueId} style={{ background: "#202c33", padding: 15, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: "bold" }}>{item.Name}</div>
                        <button onClick={() => handleDelete(item.QueueId)} style={{ background: "#d32f2f", color: "white", border: "none", borderRadius: 4, padding: "5px 10px", cursor: "pointer" }}>Inativar</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
