import React, { useEffect, useState } from "react";
import {
    Users as UsersIcon,
    Smartphone,
    Globe,
    Settings,
    Edit2,
    Trash2,
    Play,
    Pause,
    Anchor,
    Copy,
    ChevronRight,
    Search
} from "lucide-react";

import { api } from "./lib/api";

export function SuperAdmin({ token, onBack }: { token: string; onBack: () => void }) {
    const [tab, setTab] = useState<"tenants" | "users" | "instances">("tenants");

    // Tenants State
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Users State
    const [users, setUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Instances State
    const [instancesList, setInstancesList] = useState<any[]>([]);
    const [loadingInstancesList, setLoadingInstancesList] = useState(false);
    const [showInstanceModal, setShowInstanceModal] = useState(false);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());

    // Webhook Config State
    const [showWebhookModal, setShowWebhookModal] = useState(false);
    const [webhookConnectorId, setWebhookConnectorId] = useState("");
    const [webhookBaseUrl, setWebhookBaseUrl] = useState("");
    const [webhookEvents, setWebhookEvents] = useState<string[]>([
        "connection", "history", "messages", "messages_update",
        "call", "contacts", "presence", "groups", "labels",
        "chats", "chat_labels", "blocks", "leads"
    ]);
    const [webhookExclusions, setWebhookExclusions] = useState<string[]>([
        "wasSentByApi", "wasNotSentByApi", "fromMeYes", "fromMeNo", "isGroupYes", "IsGroupNo"
    ]);
    const [addUrlEvents, setAddUrlEvents] = useState(true);
    const [addUrlTypesMessages, setAddUrlTypesMessages] = useState(true);

    // Instance Form
    const [instTenantId, setInstTenantId] = useState("");
    const [instProvider, setInstProvider] = useState("GTI");
    const [instName, setInstName] = useState("");
    const [instConfig, setInstConfig] = useState("");

    // GTI Specific Form State
    const [gtiToken, setGtiToken] = useState("");
    const [gtiInstanceId, setGtiInstanceId] = useState("");
    const [gtiPhoneId, setGtiPhoneId] = useState("");

    // Form
    const [companyName, setCompanyName] = useState("");
    const [adminName, setAdminName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [planDays, setPlanDays] = useState(30);

    // SuperAdmin User Management Form
    const [showUserModal, setShowUserModal] = useState(false);
    const [editUserId, setEditUserId] = useState<string | null>(null);
    const [userTenantId, setUserTenantId] = useState("");
    const [userName, setUserName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [userPassword, setUserPassword] = useState("");
    const [userRole, setUserRole] = useState("AGENT");



    useEffect(() => {
        if (tab === "tenants") loadTenants();
        else if (tab === "users") loadUsers();
        else if (tab === "instances") {
            loadInstances();
            loadTenants(); // Need tenants for dropdown
        }
    }, [tab]);

    async function loadTenants() {
        setLoading(true);
        try {
            const res = await api.get("/api/admin/tenants");
            if (Array.isArray(res.data)) {
                setTenants(res.data);
                if (res.data.length > 0) {
                    if (!instTenantId) setInstTenantId(res.data[0].TenantId);
                    if (!userTenantId) setUserTenantId(res.data[0].TenantId);
                }
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar tenants");
        } finally {
            setLoading(false);
        }
    }

    async function loadUsers() {
        setLoadingUsers(true);
        try {
            const res = await api.get("/api/admin/users");
            if (Array.isArray(res.data)) setUsers(res.data);
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar usuários");
        } finally {
            setLoadingUsers(false);
        }
    }

    async function loadInstances() {
        setLoadingInstancesList(true);
        try {
            const res = await api.get("/api/admin/instances");
            if (Array.isArray(res.data)) setInstancesList(res.data);
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar instâncias");
        } finally {
            setLoadingInstancesList(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!confirm("Criar nova empresa?")) return;

        try {
            const res = await api.post("/api/admin/tenants", { companyName, adminName, email, password, planDays });
            alert("Empresa criada com sucesso! ID: " + res.data.tenantId);
            setShowModal(false);
            setCompanyName("");
            setAdminName("");
            setEmail("");
            setPassword("");
            loadTenants();
        } catch (e: any) {
            alert("Erro: " + (e.response?.data?.error || e.message));
        }
    }

    async function handleReassign(connectorId: string, newTenantId: string) {
        if (!confirm("Tem certeza que deseja mover esta instância para outra empresa?")) return;
        try {
            await api.put(`/api/admin/instances/${connectorId}/tenant`, { tenantId: newTenantId });
            alert("Instância movida com sucesso!");
            loadInstances();
        } catch (e: any) {
            alert("Erro: " + (e.response?.data?.error || e.message));
        }
    }


    async function handleFetchGtiInfo() {
        if (!gtiToken) {
            alert("Insira o token primeiro.");
            return;
        }
        try {
            const res = await api.post("/api/admin/gti/fetch-info", { token: gtiToken });
            const data = res.data;

            // Auto-fill fields
            if (data.instance) {
                if (data.instance.id) setGtiInstanceId(data.instance.id);
                if (data.instance.owner) setGtiPhoneId(data.instance.owner);
                alert("Dados obtidos com sucesso!");
            } else {
                alert("Dados obtidos, mas formato inesperado. Verifique os campos.");
                console.log(data);
            }
        } catch (e: any) {
            alert("Erro ao buscar dados GTI: " + (e.response?.data?.error || e.message));
        }
    }

    async function handleCreateInstance(e: React.FormEvent) {
        e.preventDefault();
        if (!instTenantId) {
            alert("Selecione uma empresa (Tenant) antes de criar a instância.");
            return;
        }
        try {
            let finalConfig = {};
            if (instProvider === "GTI") {
                finalConfig = {
                    apiKey: gtiToken,
                    token: gtiToken,
                    instance: gtiInstanceId,
                    phoneNumberId: gtiPhoneId,
                    baseUrl: "https://api.gtiapi.workers.dev"
                };
            } else {
                try {
                    finalConfig = JSON.parse(instConfig);
                } catch (err) {
                    alert("JSON de configuração inválido");
                    return;
                }
            }

            await api.post("/api/admin/instances", {
                tenantId: instTenantId,
                provider: instProvider,
                channelName: instName,
                config: finalConfig
            });

            alert("Instância criada com sucesso!");
            setShowInstanceModal(false);
            setInstName("");
            setInstConfig("");
            setGtiToken("");
            setGtiInstanceId("");
            setGtiPhoneId("");
            loadInstances();
        } catch (e: any) {
            const errorMsg = e.response?.data?.error || e.message;
            const details = e.response?.data?.details ? JSON.stringify(e.response.data.details) : "";
            alert(`Erro: ${errorMsg} ${details}`);
        }
    }

    // --- SELECTION LOGIC ---
    function toggleSelectAll() {
        if (selectedInstanceIds.size === instancesList.length) {
            setSelectedInstanceIds(new Set());
        } else {
            setSelectedInstanceIds(new Set(instancesList.map(i => i.ConnectorId)));
        }
    }

    function toggleSelectOne(id: string) {
        const newSet = new Set(selectedInstanceIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedInstanceIds(newSet);
    }

    async function handleBulkDelete() {
        if (selectedInstanceIds.size === 0) return;
        if (!confirm(`Tem certeza que deseja excluir ${selectedInstanceIds.size} instâncias? Essa ação não pode ser desfeita.`)) return;

        try {
            const res = await api.post("/api/admin/instances/bulk-delete", { connectorIds: Array.from(selectedInstanceIds) });
            alert(`Sucesso! ${res.data.count} instâncias excluídas.`);
            setSelectedInstanceIds(new Set());
            loadInstances();
        } catch (e: any) {
            alert("Erro ao excluir: " + (e.response?.data?.error || e.message));
        }
    }

    async function handleSetWebhook(e: React.FormEvent) {
        e.preventDefault();
        try {
            await api.post(`/api/admin/instances/${webhookConnectorId}/set-webhook`, {
                webhookBaseUrl,
                events: webhookEvents,
                excludeMessages: webhookExclusions,
                addUrlEvents,
                addUrlTypesMessages
            });
            alert("Webhook configurado com sucesso!");
            setShowWebhookModal(false);
        } catch (e: any) {
            alert("Erro ao configurar webhook: " + (e.response?.data?.error || e.message));
        }
    }
    // -----------------------

    async function handleDelete(tenantId: string) {
        if (confirm("Tem certeza que deseja desativar esta empresa? O acesso será bloqueado.")) {
            try {
                await api.delete(`/api/admin/tenants/${tenantId}`);
                loadTenants();
            } catch (e: any) {
                alert("Erro: " + (e.response?.data?.error || e.message));
            }
        }
    }

    async function handleReactivateTenant(tenantId: string) {
        if (confirm("Tem certeza que deseja REATIVAR esta empresa?")) {
            try {
                await api.put(`/api/admin/tenants/${tenantId}/reactivate`);
                loadTenants();
            } catch (e: any) {
                alert("Erro: " + (e.response?.data?.error || e.message));
            }
        }
    }

    // --- GLOBAL USERS LOGIC ---
    async function handleToggleUserStatus(userId: string, currentStatus: boolean) {
        if (!confirm(`Deseja ${currentStatus ? "desativar" : "ativar"} este usuário?`)) return;
        try {
            await api.put(`/api/admin/users/${userId}/status`, { isActive: !currentStatus });
            loadUsers();
        } catch (e: any) {
            alert("Erro: " + (e.response?.data?.error || e.message));
        }
    }

    async function handleSaveUser(e: React.FormEvent) {
        e.preventDefault();
        try {
            const method = editUserId ? "put" : "post";
            const url = editUserId ? `/api/admin/users/${editUserId}` : `/api/admin/users`;

            const payload: any = {
                tenantId: userTenantId,
                name: userName,
                email: userEmail,
                role: userRole
            };
            if (userPassword) payload.password = userPassword;

            await api[method](url, payload);

            alert("Usuário salvo com sucesso!");
            setShowUserModal(false);
            loadUsers();
        } catch (e: any) {
            alert("Erro: " + (e.response?.data?.error || e.message));
        }
    }

    function openNewUser() {
        setEditUserId(null);
        setUserName("");
        setUserEmail("");
        setUserPassword("");
        setUserRole("AGENT");
        setUserTenantId(tenants.length > 0 ? tenants[0].TenantId : "");
        setShowUserModal(true);
    }

    function openEditUser(u: any) {
        setEditUserId(u.UserId);
        setUserName(u.AgentName || "");
        setUserEmail(u.Email);
        setUserPassword(""); // Leave blank
        setUserRole(u.Role);
        setUserTenantId(u.TenantId || (tenants.length > 0 ? tenants[0].TenantId : ""));
        setShowUserModal(true);
    }

    // Details Modal
    const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
    const [instances, setInstances] = useState<any[]>([]);
    const [loadingInstances, setLoadingInstances] = useState(false);

    async function openDetails(tenant: any) {
        setSelectedTenant(tenant);
        setInstances([]);
        setLoadingInstances(true);
        try {
            const res = await api.get(`/api/admin/tenants/${tenant.TenantId}/instances`);
            if (Array.isArray(res.data)) setInstances(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingInstances(false);
        }
    }

    // Agent Limit Modal
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [editTenant, setEditTenant] = useState<any>(null);
    const [newLimit, setNewLimit] = useState(5);

    function openEditLimit(tenant: any) {
        setEditTenant(tenant);
        setNewLimit(tenant.AgentsSeatLimit || 5);
        setShowLimitModal(true);
    }

    async function handleSaveLimit(e: React.FormEvent) {
        e.preventDefault();
        try {
            await api.put(`/api/admin/tenants/${editTenant.TenantId}`, { agentsLimit: newLimit });
            alert("Limite atualizado com sucesso!");
            setShowLimitModal(false);
            loadTenants();
        } catch (e: any) {
            alert("Erro: " + (e.response?.data?.error || e.message));
        }
    }

    return (
        <div className="settings-page" style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto", color: "var(--text-primary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", transition: "color 0.2s" }} className="hover-accent">
                    ← <span style={{ marginLeft: 4 }}>Voltar</span>
                </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>🏢 Super Admin</h1>
                <div style={{ display: "flex", gap: 12 }}>
                    {tab === "tenants" && (
                        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ padding: "12px 20px", borderRadius: 12 }}>
                            + Nova Empresa
                        </button>
                    )}
                    {tab === "instances" && (
                        <button onClick={() => setShowInstanceModal(true)} className="btn btn-primary" style={{ padding: "12px 20px", borderRadius: 12 }}>
                            + Nova Instância
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", gap: 32, marginBottom: 32, borderBottom: "1px solid var(--border)" }}>
                {[
                    { id: "tenants", label: "Empresas", icon: "🏢" },
                    { id: "users", label: "Usuários", icon: "👥" },
                    { id: "instances", label: "Instâncias", icon: "🔌" }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        style={{
                            padding: "12px 4px",
                            background: "none",
                            border: "none",
                            color: tab === t.id ? "var(--accent)" : "var(--text-secondary)",
                            borderBottom: tab === t.id ? "3px solid var(--accent)" : "3px solid transparent",
                            cursor: "pointer",
                            fontSize: "1rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            transition: "all 0.2s"
                        }}
                    >
                        <span>{t.icon}</span> {t.label}
                    </button>
                ))}
            </div>

            {/* TENANTS TAB */}
            {tab === "tenants" && (
                <>
                    {loading && <p style={{ color: "var(--text-secondary)" }}>Carregando...</p>}
                    <div className="tenant-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
                        {tenants.map(t => (
                            <div key={t.TenantId} style={{
                                background: "var(--bg-secondary)",
                                padding: 24,
                                borderRadius: 16,
                                border: "1px solid var(--border)",
                                display: "flex",
                                flexDirection: "column",
                                gap: 16,
                                transition: "all 0.2s",
                                cursor: "pointer",
                                position: "relative"
                            }}
                                className="card-hover"
                                onClick={() => openDetails(t)}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)" }}>{t.Name}</h3>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                        <span style={{ fontSize: "1.2rem" }}>🏢</span>
                                        <span style={{
                                            fontSize: "0.65rem",
                                            color: "var(--text-secondary)",
                                            background: "var(--bg-primary)",
                                            padding: "2px 6px",
                                            borderRadius: 4,
                                            border: "1px solid var(--border)"
                                        }}>ID: {t.TenantId.slice(0, 8)}...</span>
                                    </div>
                                </div>

                                <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span>Usuários: <b>{t.UserCount}</b></span>
                                        <span>Instâncias: <b>{t.InstanceCount || 0}</b></span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span>Limite Agentes: <b>{t.AgentsSeatLimit}</b></span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openEditLimit(t); }}
                                            className="btn btn-ghost"
                                            style={{ padding: "4px 10px", borderRadius: 8, fontSize: "0.75rem" }}
                                        >
                                            ✎ Editar
                                        </button>
                                    </div>
                                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span>Expira: <b style={{ color: "var(--text-primary)" }}>{new Date(t.ExpiresAt).toLocaleDateString()}</b></span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <span style={{
                                                fontSize: "0.7rem",
                                                fontWeight: 700,
                                                color: t.IsActive ? "var(--accent)" : "var(--danger)"
                                            }}>
                                                {t.IsActive ? "● ATIVO" : "● INATIVO"}
                                            </span>
                                            {t.IsActive ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(t.TenantId); }}
                                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}
                                                    title="Desativar"
                                                >
                                                    🗑️
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleReactivateTenant(t.TenantId); }}
                                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}
                                                    title="Reativar"
                                                >
                                                    🔄
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* USERS TAB */}
            {
                tab === "users" && (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
                                <UsersIcon size={18} />
                                {loadingUsers ? <span>Carregando...</span> : <span>{users.length} usuários encontrados</span>}
                            </div>
                            <button onClick={openNewUser} className="btn btn-primary" style={{ borderRadius: 10 }}>
                                + Novo Usuário
                            </button>
                        </div>
                        <div style={{ overflowX: "auto", background: "var(--bg-secondary)", borderRadius: 16, border: "1px solid var(--border)" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-primary)" }}>
                                <thead>
                                    <tr style={{ background: "var(--bg-active)", textAlign: "left" }}>
                                        <th style={{ padding: "16px 20px" }}>Nome</th>
                                        <th style={{ padding: "16px 20px" }}>Email</th>
                                        <th style={{ padding: "16px 20px" }}>Permissão</th>
                                        <th style={{ padding: "16px 20px" }}>Empresa</th>
                                        <th style={{ padding: "16px 20px" }}>Status</th>
                                        <th style={{ padding: "16px 20px", textAlign: "right" }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.UserId} style={{ borderBottom: "1px solid var(--border)", opacity: u.IsActive ? 1 : 0.6, transition: "background 0.2s" }} className="table-row-hover">
                                            <td style={{ padding: "16px 20px", fontWeight: 500 }}>{u.AgentName || u.Name || "-"}</td>
                                            <td style={{ padding: "16px 20px", color: "var(--text-secondary)" }}>{u.Email}</td>
                                            <td style={{ padding: "16px 20px" }}>
                                                <span style={{
                                                    padding: "4px 10px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 700,
                                                    background: u.Role === "SUPERADMIN" ? "rgba(168, 0, 132, 0.15)" : (u.Role === "ADMIN" ? "rgba(255, 152, 0, 0.15)" : "rgba(0, 168, 132, 0.15)"),
                                                    color: u.Role === "SUPERADMIN" ? "#d942f5" : (u.Role === "ADMIN" ? "#ff9800" : "#00a884")
                                                }}>
                                                    {u.Role}
                                                </span>
                                            </td>
                                            <td style={{ padding: "16px 20px" }}>{u.TenantName || "Sem Tenant"}</td>
                                            <td style={{ padding: "16px 20px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 600, color: u.IsActive ? "var(--accent)" : "var(--danger)" }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
                                                    {u.IsActive ? "Ativo" : "Inativo"}
                                                </div>
                                            </td>
                                            <td style={{ padding: "16px 20px", textAlign: "right" }}>
                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                                    <button
                                                        onClick={() => openEditUser(u)}
                                                        className="btn btn-ghost"
                                                        style={{ padding: 8, borderRadius: 8 }}
                                                        title="Editar Usuário"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleUserStatus(u.UserId, u.IsActive)}
                                                        className="btn btn-ghost"
                                                        style={{ padding: 8, borderRadius: 8, color: u.IsActive ? "var(--danger)" : "var(--accent)" }}
                                                        title={u.IsActive ? "Desativar" : "Ativar"}
                                                    >
                                                        {u.IsActive ? <Pause size={16} /> : <Play size={16} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )
            }

            {/* INSTANCES TAB */}
            {
                tab === "instances" && (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
                                <Smartphone size={18} />
                                {loadingInstancesList ? <span>Carregando...</span> : <span>{instancesList.length} instâncias encontradas</span>}
                            </div>

                            <div style={{ display: "flex", gap: 12 }}>
                                {selectedInstanceIds.size > 0 && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="btn"
                                        style={{ background: "var(--danger)", color: "white", padding: "10px 18px", borderRadius: 10 }}
                                    >
                                        Excluir Selecionados ({selectedInstanceIds.size})
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowInstanceModal(true)}
                                    className="btn btn-primary"
                                    style={{ borderRadius: 10 }}
                                >
                                    + Nova Instância
                                </button>
                            </div>
                        </div>

                        <div style={{ overflowX: "auto", background: "var(--bg-secondary)", borderRadius: 16, border: "1px solid var(--border)" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-primary)" }}>
                                <thead>
                                    <tr style={{ background: "var(--bg-active)", textAlign: "left" }}>
                                        <th style={{ padding: "16px 20px" }}>
                                            <input
                                                type="checkbox"
                                                checked={instancesList.length > 0 && selectedInstanceIds.size === instancesList.length}
                                                onChange={toggleSelectAll}
                                                style={{ accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer" }}
                                            />
                                        </th>
                                        <th style={{ padding: "16px 20px" }}>Nome</th>
                                        <th style={{ padding: "16px 20px" }}>Número/ID</th>
                                        <th style={{ padding: "16px 20px" }}>Provider</th>
                                        <th style={{ padding: "16px 20px" }}>Empresa (Dona)</th>
                                        <th style={{ padding: "16px 20px" }}>Token/Chave</th>
                                        <th style={{ padding: "16px 20px" }}>Status</th>
                                        <th style={{ padding: "16px 20px", textAlign: "right" }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {instancesList.map(i => {
                                        const config = i.ConfigJson ? JSON.parse(i.ConfigJson) : {};
                                        // Extract Phone
                                        let phone = "-";
                                        if (i.Provider === "GTI") phone = config.phoneNumberId || "-";
                                        if (i.Provider === "WHATSAPP") phone = config.phoneNumberId || "-";
                                        if (i.Provider === "OFFICIAL") phone = config.phoneNumberId || "-";

                                        // Extract Token
                                        let tokenVal = i.WebhookSecret || "-";
                                        if (i.Provider === "GTI") tokenVal = config.apiKey || "-";
                                        // if (i.Provider === "WHATSAPP") tokenVal = config.apiKey || "-"; 

                                        const isSelected = selectedInstanceIds.has(i.ConnectorId);

                                        return (
                                            <tr key={i.ConnectorId} style={{ borderBottom: "1px solid var(--border)", background: isSelected ? "rgba(0, 168, 132, 0.05)" : "transparent", transition: "all 0.2s" }} className="table-row-hover">
                                                <td style={{ padding: "16px 20px" }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelectOne(i.ConnectorId)}
                                                        style={{ accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer" }}
                                                    />
                                                </td>
                                                <td style={{ padding: "16px 20px", fontWeight: 500 }}>{i.ChannelName}</td>
                                                <td style={{ padding: "16px 20px", color: "var(--text-secondary)" }}>{phone}</td>
                                                <td style={{ padding: "16px 20px" }}>
                                                    <span style={{ background: "var(--bg-primary)", padding: "4px 8px", borderRadius: 6, fontSize: "0.75rem", border: "1px solid var(--border)" }}>
                                                        {i.Provider}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "16px 20px" }}>
                                                    <select
                                                        value={i.TenantId}
                                                        onChange={(e) => handleReassign(i.ConnectorId, e.target.value)}
                                                        style={{
                                                            padding: "8px 12px",
                                                            borderRadius: 10,
                                                            background: "var(--bg-primary)",
                                                            color: "white",
                                                            border: "1px solid var(--border)",
                                                            fontSize: "0.85rem",
                                                            outline: "none",
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        {tenants.map(t => (
                                                            <option key={t.TenantId} value={t.TenantId}>{t.Name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <code style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                                            {tokenVal.length > 20 ? tokenVal.slice(0, 20) + "..." : tokenVal}
                                                        </code>
                                                        <button
                                                            onClick={() => { navigator.clipboard.writeText(tokenVal); alert("Copiado!"); }}
                                                            className="btn btn-ghost"
                                                            style={{ padding: 4, borderRadius: 6 }}
                                                            title="Copiar Token"
                                                        >
                                                            <Copy size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 600, color: i.IsActive ? "var(--accent)" : "var(--danger)" }}>
                                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
                                                        {i.IsActive ? "Conectado" : "Offline"}
                                                    </div>
                                                </td>
                                                <td style={{ padding: "16px 20px", textAlign: "right" }}>
                                                    <button
                                                        onClick={() => {
                                                            setWebhookConnectorId(i.ConnectorId);
                                                            setShowWebhookModal(true);
                                                        }}
                                                        className="btn btn-primary"
                                                        style={{ padding: "8px 12px", borderRadius: 10, fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                                                    >
                                                        <Anchor size={14} /> Webhook
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )
            }

            {/* CREATE MODAL */}
            {showModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        width: "100%", maxWidth: 480,
                        padding: 32,
                        borderRadius: 20,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                            <span style={{ fontSize: "1.5rem" }}>🏢</span>
                            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Nova Empresa (Tenant)</h2>
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 28 }}>
                            Crie um novo ambiente isolado para o seu cliente.
                        </p>

                        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Nome da Empresa</label>
                                <input required value={companyName} onChange={e => setCompanyName(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                <div className="field">
                                    <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Nome do Admin</label>
                                    <input required value={adminName} onChange={e => setAdminName(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} />
                                </div>
                                <div className="field">
                                    <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Dias de Plano</label>
                                    <input type="number" value={planDays} onChange={e => setPlanDays(Number(e.target.value))} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} />
                                </div>
                            </div>

                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Email do Admin (Login)</label>
                                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} placeholder="exem@email.com" />
                            </div>

                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Senha Inicial</label>
                                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} />
                            </div>

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn btn-ghost" style={{ padding: "12px 24px", borderRadius: 12 }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ padding: "12px 24px", borderRadius: 12 }}>Criar Empresa</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* AGENT LIMIT MODAL */}
            {showLimitModal && editTenant && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        width: "100%", maxWidth: 400,
                        padding: 32,
                        borderRadius: 20,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                            <Settings size={20} className="text-accent" />
                            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Limite de Agentes</h3>
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 24 }}>
                            Empresa: <b style={{ color: "var(--text-primary)" }}>{editTenant.Name}</b>
                        </p>

                        <form onSubmit={handleSaveLimit}>
                            <div className="field" style={{ marginBottom: 24 }}>
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Novo Limite de Cadeiras</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={newLimit}
                                    onChange={e => setNewLimit(Number(e.target.value))}
                                    style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }}
                                />
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                                <button type="button" onClick={() => setShowLimitModal(false)} className="btn btn-ghost" style={{ padding: "10px 20px", borderRadius: 10 }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ padding: "10px 20px", borderRadius: 10 }}>Salvar Limite</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CREATE INSTANCE MODAL */}
            {showInstanceModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        width: "100%", maxWidth: 520,
                        padding: 32,
                        borderRadius: 20,
                        maxHeight: "90vh",
                        overflowY: "auto",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                            <Smartphone size={24} className="text-accent" />
                            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Nova Instância</h2>
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 28 }}>
                            Conecte um novo canal de comunicação ao sistema.
                        </p>

                        <form onSubmit={handleCreateInstance} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Nome do Canal</label>
                                <input required value={instName} onChange={e => setInstName(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} placeholder="EX: WhatsApp Comercial" />
                            </div>

                            {instProvider === "GTI" ? (
                                <div style={{ background: "var(--bg-primary)", padding: 24, borderRadius: 16, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <Globe size={16} className="text-secondary" />
                                        <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Configuração GTI</span>
                                    </div>

                                    <div className="field">
                                        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Token (API Key)*</label>
                                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                            <input
                                                required
                                                value={gtiToken}
                                                onChange={e => setGtiToken(e.target.value)}
                                                style={{ flex: 1, background: "var(--bg-secondary)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", color: "white" }}
                                                placeholder="Token da instância"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleFetchGtiInfo}
                                                className="btn btn-primary"
                                                style={{ padding: "0 16px", borderRadius: 10, fontSize: "0.8rem" }}
                                            >
                                                Verificar
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                        <div className="field">
                                            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Instance ID</label>
                                            <input
                                                value={gtiInstanceId}
                                                readOnly
                                                style={{ width: "100%", marginTop: 8, background: "var(--bg-secondary)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: 0.8 }}
                                            />
                                        </div>
                                        <div className="field">
                                            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Phone / Owner</label>
                                            <input
                                                value={gtiPhoneId}
                                                readOnly
                                                style={{ width: "100%", marginTop: 8, background: "var(--bg-secondary)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: 0.8 }}
                                            />
                                        </div>
                                    </div>
                                    <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", margin: 0, fontStyle: "italic" }}>
                                        Os campos Instance ID e Phone são preenchidos ao validar o token.
                                    </p>
                                </div>
                            ) : (
                                <div className="field">
                                    <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Config JSON</label>
                                    <textarea
                                        required
                                        value={instConfig}
                                        onChange={e => setInstConfig(e.target.value)}
                                        rows={4}
                                        style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white", fontFamily: "monospace", fontSize: "0.85rem" }}
                                        placeholder='{"apiKey": "xyz", "phoneNumberId": "123"}'
                                    />
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
                                <button type="button" onClick={() => setShowInstanceModal(false)} className="btn btn-ghost" style={{ padding: "12px 24px", borderRadius: 12 }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ padding: "12px 24px", borderRadius: 12 }}>Criar Instância</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DETAILS MODAL */}
            {selectedTenant && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        width: "100%", maxWidth: 600,
                        padding: 32,
                        borderRadius: 24,
                        maxHeight: "90vh",
                        overflowY: "auto",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Globe size={24} className="text-accent" />
                                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{selectedTenant.Name}</h2>
                            </div>
                            <button onClick={() => setSelectedTenant(null)} className="btn btn-ghost" style={{ padding: 8, borderRadius: 12 }}>✕</button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
                            <div style={{ background: "var(--bg-primary)", padding: 20, borderRadius: 16, border: "1px solid var(--border)" }}>
                                <label style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>Informações Gerais</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "0.9rem" }}>
                                    <div>Status: <b style={{ color: selectedTenant.IsActive ? "var(--accent)" : "var(--danger)" }}>{selectedTenant.IsActive ? "ATIVO" : "INATIVO"}</b></div>
                                    <div>Criado em: <b>{new Date(selectedTenant.CreatedAt).toLocaleDateString()}</b></div>
                                    <div>Expira em: <b>{new Date(selectedTenant.ExpiresAt).toLocaleDateString()}</b></div>
                                </div>
                            </div>
                            <div style={{ background: "var(--bg-primary)", padding: 20, borderRadius: 16, border: "1px solid var(--border)" }}>
                                <label style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>Estatísticas</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "0.9rem" }}>
                                    <div>Usuários: <b>{selectedTenant.UserCount}</b></div>
                                    <div>Instâncias: <b>{selectedTenant.InstanceCount || 0}</b></div>
                                    <div>Limite Cadeiras: <b>{selectedTenant.AgentsSeatLimit}</b></div>
                                </div>
                            </div>
                        </div>

                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                                <Smartphone size={18} className="text-secondary" />
                                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Instâncias da Empresa</h3>
                            </div>

                            {loadingInstances ? <p style={{ color: "var(--text-secondary)" }}>Carregando...</p> : (
                                <div style={{ display: "grid", gap: 12 }}>
                                    {instances.length === 0 && <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontStyle: "italic" }}>Nenhuma instância vinculada.</p>}
                                    {instances.map(i => (
                                        <div key={i.ConnectorId} style={{
                                            background: "var(--bg-primary)",
                                            padding: 16,
                                            borderRadius: 16,
                                            border: "1px solid var(--border)",
                                            borderLeft: `4px solid ${i.IsActive ? 'var(--accent)' : 'var(--danger)'}`,
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center"
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{i.ChannelName || i.ConnectorId}</div>
                                                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>Provider: {i.Provider}</div>
                                            </div>
                                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: i.IsActive ? "var(--accent)" : "var(--danger)" }}>
                                                {i.IsActive ? "ON" : "OFF"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end" }}>
                            <button onClick={() => setSelectedTenant(null)} className="btn btn-primary" style={{ padding: "12px 32px", borderRadius: 12 }}>Fechar Detalhes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SUPERADMIN USER MODAL */}
            {showUserModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        width: "100%", maxWidth: 450,
                        padding: 32,
                        borderRadius: 20,
                        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                            <UsersIcon size={24} className="text-accent" />
                            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{editUserId ? "Editar Usuário" : "Novo Usuário"}</h2>
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 28 }}>
                            {editUserId ? "Atualize as informações do usuário selecionado." : "Adicione um novo usuário ao sistema ou a uma empresa."}
                        </p>

                        <form onSubmit={handleSaveUser} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Empresa (Tenant)</label>
                                <select required value={userTenantId} onChange={e => setUserTenantId(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white", cursor: "pointer", outline: "none" }}>
                                    <option value="" disabled>Selecione uma empresa</option>
                                    {tenants.map(t => (
                                        <option key={t.TenantId} value={t.TenantId}>{t.Name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Nome Completo</label>
                                <input required value={userName} onChange={e => setUserName(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} placeholder="Nome do usuário" />
                            </div>

                            <div className="field">
                                <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Email (Login)</label>
                                <input required type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} placeholder="exem@email.com" />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                <div className="field">
                                    <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Permissão</label>
                                    <select required value={userRole} onChange={e => setUserRole(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white", cursor: "pointer", outline: "none" }}>
                                        <option value="AGENT">Agente</option>
                                        <option value="ADMIN">Gerente (Admin)</option>
                                        <option value="SUPERADMIN">Root (SuperAdmin)</option>
                                    </select>
                                </div>
                                <div className="field">
                                    <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Senha</label>
                                    <input type="password" required={!editUserId} placeholder={editUserId ? "••••••" : "Mín. 6 carac."} value={userPassword} onChange={e => setUserPassword(e.target.value)} style={{ width: "100%", marginTop: 8, background: "var(--bg-primary)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", color: "white" }} />
                                </div>
                            </div>
                            {editUserId && <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: -12 }}>Deixe a senha em branco para não alterar.</p>}

                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
                                <button type="button" onClick={() => setShowUserModal(false)} className="btn btn-ghost" style={{ padding: "12px 24px", borderRadius: 12 }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ padding: "12px 24px", borderRadius: 12 }}>{editUserId ? "Salvar Alterações" : "Criar Usuário"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* WEBHOOK MODAL (Standardized UI) */}
            {
                showWebhookModal && (
                    <div style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        background: "rgba(0,0,0,0.6)",
                        backdropFilter: "blur(4px)",
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                    }}>
                        <div style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            width: "100%", maxWidth: 650,
                            padding: 32,
                            borderRadius: 20,
                            maxHeight: "85vh",
                            overflowY: "auto",
                            boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                <span style={{ fontSize: "1.8rem" }}>⚓</span>
                                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>Configurar Webhook Avançado</h2>
                            </div>
                            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 28 }}>
                                Personalize quais eventos e filtros deseja aplicar à sua integração GTI.
                            </p>

                            <form onSubmit={handleSetWebhook} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                                <div className="field">
                                    <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>URL Base da sua API</label>
                                    <input
                                        placeholder="https://sua-callback.com"
                                        value={webhookBaseUrl}
                                        onChange={e => setWebhookBaseUrl(e.target.value)}
                                        required
                                        style={{
                                            width: "100%",
                                            marginTop: 8,
                                            background: "var(--bg-primary)",
                                            padding: "12px 16px",
                                            borderRadius: 12,
                                            border: "1px solid var(--border)",
                                            color: "white"
                                        }}
                                    />
                                </div>

                                <section>
                                    <label style={{
                                        display: "block",
                                        marginBottom: 12,
                                        fontSize: "0.85rem",
                                        fontWeight: 600,
                                        color: "var(--accent)"
                                    }}>
                                        Eventos Disponíveis
                                    </label>
                                    <div style={{
                                        background: "var(--bg-primary)",
                                        padding: 20,
                                        borderRadius: 16,
                                        display: "grid",
                                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                        gap: 12,
                                        border: "1px solid var(--border)"
                                    }}>
                                        {[
                                            "connection", "history", "messages", "messages_update",
                                            "call", "contacts", "presence", "groups", "labels",
                                            "chats", "chat_labels", "blocks", "leads"
                                        ].map(ev => (
                                            <label key={ev} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", cursor: "pointer", color: webhookEvents.includes(ev) ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={webhookEvents.includes(ev)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setWebhookEvents([...webhookEvents, ev]);
                                                        else setWebhookEvents(webhookEvents.filter(x => x !== ev));
                                                    }}
                                                    style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
                                                />
                                                {ev}
                                            </label>
                                        ))}
                                    </div>
                                </section>

                                <section>
                                    <label style={{
                                        display: "block",
                                        marginBottom: 12,
                                        fontSize: "0.85rem",
                                        fontWeight: 600,
                                        color: "var(--danger)"
                                    }}>
                                        Exclusões (ExcludeMessages)
                                    </label>
                                    <div style={{
                                        background: "var(--bg-primary)",
                                        padding: 20,
                                        borderRadius: 16,
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr 1fr",
                                        gap: 12,
                                        border: "1px solid var(--border)"
                                    }}>
                                        {[
                                            "wasSentByApi", "wasNotSentByApi", "fromMeYes", "fromMeNo", "isGroupYes", "IsGroupNo"
                                        ].map(ex => (
                                            <label key={ex} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", cursor: "pointer", color: webhookExclusions.includes(ex) ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={webhookExclusions.includes(ex)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setWebhookExclusions([...webhookExclusions, ex]);
                                                        else setWebhookExclusions(webhookExclusions.filter(x => x !== ex));
                                                    }}
                                                    style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
                                                />
                                                {ex}
                                            </label>
                                        ))}
                                    </div>
                                </section>

                                <section style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "8px 0" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            checked={addUrlEvents}
                                            onChange={(e) => setAddUrlEvents(e.target.checked)}
                                            style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
                                        />
                                        addUrlEvents
                                    </label>
                                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            checked={addUrlTypesMessages}
                                            onChange={(e) => setAddUrlTypesMessages(e.target.checked)}
                                            style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
                                        />
                                        addUrlTypesMessages
                                    </label>
                                </section>

                                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowWebhookModal(false)}
                                        className="btn btn-ghost"
                                        style={{ flex: 1, padding: "14px", borderRadius: 12 }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        style={{ flex: 1.5, padding: "14px", borderRadius: 12, fontSize: "14px" }}
                                    >
                                        ⚓ Salvar Configuração
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
