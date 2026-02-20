import { useState, useEffect } from "react";

type Contact = {
    ContactId: string;
    Name: string;
    Phone: string;
    Email?: string;
    Tags?: string[];
    Notes?: string;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function Contacts({ onBack, onStartChat }: { onBack: () => void, onStartChat: (c: any) => void }) {
    const [items, setItems] = useState<Contact[]>([]);
    const [search, setSearch] = useState("");
    const [view, setView] = useState<"LIST" | "EDIT">("LIST");
    const [editing, setEditing] = useState<Partial<Contact>>({});
    const token = localStorage.getItem("token");

    useEffect(() => {
        loadContacts();
    }, [search]);

    function loadContacts() {
        let url = `${API}/api/contacts`;
        if (search) url += `?search=${encodeURIComponent(search)}`;
        fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setItems(data);
                } else {
                    console.error("Invalid contacts format:", data);
                    setItems([]);
                }
            })
            .catch(err => {
                console.error(err);
                setItems([]);
            });
    }

    const handleSave = async () => {
        if (!editing.Name || !editing.Phone) return alert("Nome e Telefone obrigatórios");

        const method = editing.ContactId ? "PUT" : "POST";
        const url = editing.ContactId
            ? `${API}/api/contacts/${editing.ContactId}`
            : `${API}/api/contacts`;

        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                name: editing.Name,
                phone: editing.Phone,
                email: editing.Email,
                notes: editing.Notes,
                tags: editing.Tags
            })
        });

        if (res.ok) {
            setView("LIST");
            setEditing({});
            loadContacts();
        } else {
            const err = await res.json().catch(() => ({}));
            alert("Erro ao salvar: " + (err.error || JSON.stringify(err) || res.statusText));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Deletar contato?")) return;
        await fetch(`${API}/api/contacts/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        setItems(items.filter(i => i.ContactId !== id));
    };

    return (
        <div className="main-area" style={{ padding: 20, flex: 1, overflowY: "auto", color: "var(--text-primary)" }}>
            {view === "LIST" && (
                <>
                    <div className="header">
                        <button onClick={onBack} style={{ marginRight: 10, background: "none", border: "none", color: "inherit", cursor: "pointer" }}>← Voltar</button>
                        <h2>Contatos</h2>
                        <button onClick={() => { setEditing({}); setView("EDIT"); }} style={{ marginLeft: "auto" }}>+ Novo</button>
                    </div>

                    <div style={{ margin: "20px 0" }}>
                        <input
                            placeholder="Buscar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: "100%", padding: 10, borderRadius: 5, border: "none" }}
                        />
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                        {items.map(c => (
                            <div key={c.ContactId} style={{ background: "#202c33", padding: 15, borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                                <div>
                                    <div style={{ fontWeight: "bold" }}>{c.Name}</div>
                                    <div style={{ opacity: 0.7 }}>{c.Phone}</div>
                                </div>
                                <div>
                                    <button onClick={() => onStartChat(c)} style={{ marginRight: 10, background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }} title="Enviar Mensagem">💬</button>
                                    <button onClick={() => { setEditing(c); setView("EDIT"); }} style={{ marginRight: 10 }}>✏️</button>
                                    <button onClick={() => handleDelete(c.ContactId)} style={{ color: "#f44" }}>🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {view === "EDIT" && (
                <div style={{ maxWidth: 500 }}>
                    <h2>{editing.ContactId ? "Editar Contato" : "Novo Contato"}</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                        <input placeholder="Nome" value={editing.Name || ""} onChange={e => setEditing({ ...editing, Name: e.target.value })} style={{ padding: 10, borderRadius: 5, border: "none" }} />
                        <input placeholder="Telefone" value={editing.Phone || ""} onChange={e => setEditing({ ...editing, Phone: e.target.value })} style={{ padding: 10, borderRadius: 5, border: "none" }} />
                        <input placeholder="Email" value={editing.Email || ""} onChange={e => setEditing({ ...editing, Email: e.target.value })} style={{ padding: 10, borderRadius: 5, border: "none" }} />
                        <textarea placeholder="Notas" value={editing.Notes || ""} onChange={e => setEditing({ ...editing, Notes: e.target.value })} style={{ padding: 10, borderRadius: 5, border: "none", height: 100 }} />

                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={handleSave} style={{ flex: 1, padding: 10 }}>Salvar</button>
                            <button onClick={() => setView("LIST")} style={{ flex: 1, padding: 10, background: "#555" }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
