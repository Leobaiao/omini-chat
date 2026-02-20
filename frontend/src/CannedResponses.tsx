import { useState, useEffect } from "react";

type CannedResponse = {
    CannedResponseId: string;
    Shortcut: string;
    Content: string;
    Title: string;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function CannedResponses({ onBack }: { onBack: () => void }) {
    const [items, setItems] = useState<CannedResponse[]>([]);
    const [view, setView] = useState<"LIST" | "NEW">("LIST");
    const [newShortcut, setNewShortcut] = useState("");
    const [newContent, setNewContent] = useState("");
    const [newTitle, setNewTitle] = useState("");

    const token = localStorage.getItem("token");

    useEffect(() => {
        fetch(`${API}/api/canned-responses`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((res) => res.json())
            .then(setItems)
            .catch(console.error);
    }, []);

    const handleSave = async () => {
        if (!newShortcut || !newContent || !newTitle) return alert("Preencha todos os campos");

        const res = await fetch(`${API}/api/canned-responses`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ shortcut: newShortcut, content: newContent, title: newTitle }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return alert("Erro ao salvar: " + (err.error || res.statusText));
        }

        // reload
        const listRes = await fetch(`${API}/api/canned-responses`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setItems(await listRes.json());
        setView("LIST");
        setNewShortcut("");
        setNewContent("");
        setNewTitle("");
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Deletar?")) return;
        await fetch(`${API}/api/canned-responses/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        setItems(items.filter((i) => i.CannedResponseId !== id));
    };

    return (
        <div className="main-area" style={{ padding: 20 }}>
            <div className="header">
                <button onClick={onBack} style={{ marginRight: 10, background: "none", border: "none", color: "inherit", cursor: "pointer" }}>← Voltar</button>
                <h2>Respostas Rápidas</h2>
                {view === "LIST" && <button onClick={() => setView("NEW")} style={{ marginLeft: "auto" }}>+ Nova</button>}
            </div>

            {view === "LIST" && (
                <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
                    {items.map((item) => (
                        <div key={item.CannedResponseId} style={{ background: "#202c33", padding: 10, borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontWeight: "bold" }}>/{item.Shortcut} - {item.Title}</div>
                                <div style={{ opacity: 0.7, fontSize: "0.9em" }}>{item.Content}</div>
                            </div>
                            <button onClick={() => handleDelete(item.CannedResponseId)} style={{ background: "#d32f2f", color: "white", border: "none", borderRadius: 4, padding: "5px 10px", cursor: "pointer" }}>Trash</button>
                        </div>
                    ))}
                </div>
            )}

            {view === "NEW" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400, marginTop: 20 }}>
                    <input placeholder="Título (ex: Saudação)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ padding: 10, borderRadius: 5, border: "none" }} />
                    <input placeholder="Atalho (ex: oi)" value={newShortcut} onChange={(e) => setNewShortcut(e.target.value)} style={{ padding: 10, borderRadius: 5, border: "none" }} />
                    <textarea placeholder="Conteúdo da mensagem..." value={newContent} onChange={(e) => setNewContent(e.target.value)} style={{ padding: 10, borderRadius: 5, border: "none", height: 100 }} />
                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={handleSave} style={{ flex: 1, padding: 10 }}>Salvar</button>
                        <button onClick={() => setView("LIST")} style={{ flex: 1, padding: 10, background: "#555" }}>Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
