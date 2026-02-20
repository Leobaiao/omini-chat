import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { z } from "zod";

import { getPool } from "./db.js";
import { authMw, requireRole } from "./mw.js";
import { signToken, verifyPassword, hashPassword, assertAgentSeatAvailable, assertTenantActive } from "./auth.js";
import { Orchestrator, TriageBot } from "./agents.js";

import { GtiAdapter } from "./adapters/gti.js";
import { OfficialAdapter } from "./adapters/official.js";
import { resolveConversationForInbound, saveInboundMessage, saveOutboundMessage } from "./services/conversation.js";
import { listCannedResponses, createCannedResponse, deleteCannedResponse } from "./services/canned-response.js";
import { listQueues, createQueue, deleteQueue, assignConversation } from "./services/queue.js";
import { listContacts, createContact, updateContact, deleteContact, getContactByPhone } from "./services/contact.js";
import { listTemplates, createTemplate, deleteTemplate } from "./services/template.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const orch = new Orchestrator([new TriageBot()]);

import { WebChatAdapter } from "./adapters/webchat.js";

const adapters = {
  gti: new GtiAdapter(),
  official: new OfficialAdapter(),
  whatsapp: new OfficialAdapter(), // Map classic whatsapp to official
  webchat: new WebChatAdapter()
} as const;

// Helper: load connector + channel + tenant
async function loadConnector(connectorId: string) {
  const pool = await getPool();
  const r = await pool.request()
    .input("connectorId", connectorId)
    .query(`
      SELECT cc.ConnectorId, cc.Provider, cc.ConfigJson, cc.WebhookSecret, ch.ChannelId, ch.TenantId
      FROM omni.ChannelConnector cc
      JOIN omni.Channel ch ON ch.ChannelId = cc.ChannelId
      WHERE cc.ConnectorId = @connectorId AND cc.IsActive=1 AND ch.IsActive=1
    `);
  if (r.recordset.length === 0) throw new Error("Connector not found/active");
  return r.recordset[0];
}

// --- LOGIN (exige tenantId) ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const body = z.object({
      tenantId: z.string().uuid(),
      email: z.string().email(),
      password: z.string().min(6)
    }).parse(req.body);

    const pool = await getPool();
    const r = await pool.request()
      .input("tenantId", body.tenantId)
      .input("email", body.email)
      .query(`
      SELECT TOP 1 UserId, TenantId, Role, PasswordHash, IsActive
      FROM omni.[User]
      WHERE TenantId=@tenantId AND Email=@email
    `);

    if (r.recordset.length === 0) return res.status(401).json({ error: "Credenciais inválidas" });
    const u = r.recordset[0];
    if (!u.IsActive) return res.status(403).json({ error: "Usuário inativo" });

    await assertTenantActive(u.TenantId);

    const ok = await verifyPassword(body.password, Buffer.from(u.PasswordHash));
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });

    const token = signToken({ userId: u.UserId, tenantId: u.TenantId, role: u.Role });
    return res.json({ token });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: e.errors });
    }
    return res.status(500).json({ error: e.message });
  }
});

// --- Criar agente (limite por assinatura) ---
app.post("/api/agents", authMw, requireRole("ADMIN"), async (req, res) => {
  const u = (req as any).user as { tenantId: string };
  const body = z.object({
    kind: z.enum(["HUMAN", "BOT"]),
    name: z.string().min(2),
    userId: z.string().uuid().nullable().optional()
  }).parse(req.body);

  await assertAgentSeatAvailable(u.tenantId);

  const pool = await getPool();
  const r = await pool.request()
    .input("tenantId", u.tenantId)
    .input("kind", body.kind)
    .input("name", body.name)
    .input("userId", body.userId ?? null)
    .query(`
      INSERT INTO omni.Agent (TenantId, Kind, Name, UserId)
      OUTPUT inserted.AgentId
      VALUES (@tenantId, @kind, @name, @userId)
    `);

  res.json({ agentId: r.recordset[0].AgentId });
});

// --- Webhook WhatsApp GTI / Official ---
app.post("/api/webhooks/whatsapp/:provider/:connectorId/*", async (req, res) => {
  const eventPath = req.path.split("/").slice(6).join("/"); // ex: "messages/text", "chats", "presence"
  console.log("=== WEBHOOK HIT ===", req.params.provider, req.params.connectorId, "event:", eventPath);
  console.log("Body:", JSON.stringify(req.body, null, 2));
  try {
    const provider = String(req.params.provider).toLowerCase();
    const connectorId = req.params.connectorId;

    const connector = await loadConnector(connectorId);

    const adapter = (adapters as any)[provider];
    if (!adapter) return res.status(404).send("Unknown provider");

    const inbound = adapter.parseInbound(req.body, connector);
    if (!inbound) return res.status(200).send("ignored");

    const conversationId = await resolveConversationForInbound(inbound, connector.ConnectorId, connector.ChannelId);
    await saveInboundMessage(inbound, conversationId);

    io.to(`tenant:${inbound.tenantId}`).emit("message:new", {
      conversationId,
      senderExternalId: inbound.externalUserId,
      text: inbound.text ?? `[${inbound.mediaType}]`,
      mediaType: inbound.mediaType,
      mediaUrl: inbound.mediaUrl,
      direction: "IN"
    });

    // Notificar todos os agentes do tenant que a conversa foi atualizada
    io.to(`tenant:${inbound.tenantId}`).emit("conversation:updated", {
      conversationId,
      lastMessage: inbound.text ?? `[${inbound.mediaType}]`,
      direction: "IN",
      timestamp: new Date().toISOString()
    });

    // Orquestra: no MVP, gera sugestão (não auto-reply por padrão)
    const decisions = await orch.run("TriageBot", inbound.text ?? "[media]", {
      tenantId: inbound.tenantId,
      conversationId,
      externalSenderId: inbound.externalUserId
    });

    // TODO: gravar AgentSuggestion no DB (fase 1.1)
    // TODO: habilitar auto-reply apenas para regras neutras

    return res.status(200).json({ ok: true, conversationId, decisions });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "error" });
  }
});

// --- Webhook dedicado para WebChat (simplificado) ---
// POST /api/external/webchat/message
app.post("/api/external/webchat/message", async (req, res) => {
  try {
    // Expected body: { connectorId, senderId, text, ... }
    // In a real widget, you might not expose connectorId directly but derive it from a token.
    // For MVP, widget sends connectorId.
    const { connectorId } = req.body;
    if (!connectorId) return res.status(400).json({ error: "Missing connectorId" });

    const connector = await loadConnector(connectorId);
    const adapter = adapters.webchat;

    const inbound = adapter.parseInbound(req.body, connector);
    if (!inbound) return res.status(400).json({ error: "Invalid payload" });

    const conversationId = await resolveConversationForInbound(inbound, connector.ConnectorId, connector.ChannelId);
    await saveInboundMessage(inbound, conversationId);

    // Emit to tenant
    io.to(`tenant:${inbound.tenantId}`).emit("message:new", {
      conversationId,
      senderExternalId: inbound.externalUserId,
      text: inbound.text ?? `[${inbound.mediaType}]`,
      mediaType: inbound.mediaType,
      mediaUrl: inbound.mediaUrl,
      direction: "IN"
    });

    // Also emit to the conversation room (for the widget if it is connected via socket)
    // The widget should join the conversation room upon connection.
    io.to(conversationId).emit("message:new", {
      conversationId,
      senderExternalId: inbound.externalUserId,
      text: inbound.text ?? `[${inbound.mediaType}]`,
      mediaType: inbound.mediaType,
      mediaUrl: inbound.mediaUrl,
      direction: "IN"
    });

    res.json({ ok: true, conversationId });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// --- Responder mensagem (agente humano) ---
app.post("/api/conversations/:id/reply", authMw, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    const user = (req as any).user as { tenantId: string };

    const pool = await getPool();

    // Buscar conversa + mapeamento externo + conector
    const r = await pool.request()
      .input("conversationId", conversationId)
      .input("tenantId", user.tenantId)
      .query(`
        SELECT
          etm.ExternalUserId,
          etm.ConnectorId,
          cc.Provider,
          cc.ConfigJson
        FROM omni.ExternalThreadMap etm
        JOIN omni.ChannelConnector cc ON cc.ConnectorId = etm.ConnectorId
        WHERE etm.ConversationId = @conversationId
          AND etm.TenantId = @tenantId
      `);

    if (r.recordset.length === 0) {
      return res.status(404).json({ error: "Conversa não encontrada ou sem canal externo" });
    }

    const { ExternalUserId, Provider, ConnectorId, ConfigJson } = r.recordset[0];
    const provider = String(Provider).toLowerCase();
    const adapter = (adapters as any)[provider];

    if (!adapter) {
      return res.status(400).json({ error: `Provider "${Provider}" não suportado` });
    }

    // Enviar via WhatsApp
    const connector = { ConnectorId, Provider, ConfigJson };
    await adapter.sendText(connector, ExternalUserId, text);

    // Salvar mensagem de saída no banco
    await saveOutboundMessage(user.tenantId, conversationId, text);

    // Emitir via Socket.IO para atualização em tempo real (Global)
    io.to(`tenant:${user.tenantId}`).emit("message:new", {
      conversationId,
      senderExternalId: "agent",
      text,
      direction: "OUT"
    });

    // Notificar todos os agentes do tenant
    io.to(`tenant:${user.tenantId}`).emit("conversation:updated", {
      conversationId,
      lastMessage: text,
      direction: "OUT",
      timestamp: new Date().toISOString()
    });

    console.log(`[REPLY] Enviado para ${ExternalUserId}: "${text}"`);
    return res.json({ ok: true, conversationId });
  } catch (e: any) {
    console.error("[REPLY] Erro:", e?.message);
    return res.status(500).json({ error: e?.message ?? "Erro ao enviar mensagem" });
  }
});

// --- Listar conversas do tenant ---
app.get("/api/conversations", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const pool = await getPool();
    const r = await pool.request()
      .input("tenantId", user.tenantId)
      .query(`
        SELECT c.ConversationId, c.Title, c.Status, c.Kind, c.LastMessageAt,
               etm.ExternalUserId,
               ISNULL((
                 SELECT COUNT(*) FROM omni.Message m
                 WHERE m.ConversationId = c.ConversationId
                   AND m.Direction = 'IN'
                   AND m.CreatedAt > ISNULL((
                     SELECT MAX(m2.CreatedAt) FROM omni.Message m2
                     WHERE m2.ConversationId = c.ConversationId AND m2.Direction = 'OUT'
                   ), '1900-01-01')
               ), 0) AS UnreadCount
        FROM omni.Conversation c
        LEFT JOIN omni.ExternalThreadMap etm ON etm.ConversationId = c.ConversationId
        WHERE c.TenantId = @tenantId
        ORDER BY c.LastMessageAt DESC
      `);
    return res.json(r.recordset);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "error" });
  }
});

app.delete("/api/conversations/:id", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const { deleteConversation } = await import("./services/conversation.js");
    await deleteConversation(user.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Iniciar conversa (ou buscar existente) ---
app.post("/api/conversations", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const body = z.object({
      phone: z.string().min(10),
      name: z.string().optional()
    }).parse(req.body);

    // Importar dinamicamente para evitar ciclo ou erro de top-level await se fosse o caso (mas aqui é ok)
    const { findOrCreateConversation } = await import("./services/conversation.js");

    const conversationId = await findOrCreateConversation(user.tenantId, body.phone, body.name);
    res.json({ ok: true, conversationId });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message || "Erro ao iniciar conversa" });
  }
});

// --- Histórico de mensagens de uma conversa ---
app.get("/api/conversations/:id/messages", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const pool = await getPool();
    const r = await pool.request()
      .input("conversationId", req.params.id)
      .input("tenantId", user.tenantId)
      .query(`
        SELECT MessageId, Body, Direction, SenderExternalId, MediaType, MediaUrl, CreatedAt
        FROM omni.Message
        WHERE ConversationId = @conversationId AND TenantId = @tenantId
        ORDER BY CreatedAt ASC
      `);
    return res.json(r.recordset);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "error" });
  }
});

// --- Socket.IO rooms ---
io.on("connection", (socket) => {
  // Room por conversa (mensagens)
  socket.on("conversation:join", (conversationId: string) => socket.join(conversationId));
  socket.on("conversation:leave", (conversationId: string) => socket.leave(conversationId));

  // Room por tenant (atualizações de sidebar para todos os agentes)
  socket.on("tenant:join", (tenantId: string) => socket.join(`tenant:${tenantId}`));
  socket.on("tenant:leave", (tenantId: string) => socket.leave(`tenant:${tenantId}`));
});

// Demo endpoint para simular mensagem interna (sem WhatsApp)
app.post("/api/demo/conversations/:id/messages", async (req, res) => {
  const conversationId = req.params.id;
  const body = z.object({ text: z.string().min(1) }).parse(req.body);

  io.to(conversationId).emit("message:new", {
    conversationId,
    senderExternalId: "demo",
    text: body.text,
    direction: "INTERNAL"
  });
  return res.json({ ok: true });
});

app.get("/api/canned-responses", authMw, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const items = await listCannedResponses(user.tenantId);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/canned-responses", authMw, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const { shortcut, content, title } = req.body;
    await createCannedResponse(user.tenantId, shortcut, content, title);
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message || "Erro ao salvar resposta rápida" });
  }
});

app.delete("/api/canned-responses/:id", authMw, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    await deleteCannedResponse(user.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Queue Management ---
app.get("/api/queues", authMw, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const items = await listQueues(user.tenantId);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/queues", authMw, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const { name } = req.body;
    await createQueue(user.tenantId, name);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/queues/:id", authMw, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    await deleteQueue(user.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/conversations/:id/assign", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  const { queueId, userId } = req.body; // userId ou queueId podem ser null
  await assignConversation(user.tenantId, req.params.id, queueId, userId);

  // Notificar mudança
  io.to(`tenant:${user.tenantId}`).emit("conversation:updated", {
    conversationId: req.params.id,
    timestamp: new Date().toISOString()
  });

  res.json({ ok: true });
});

// --- Contact Management ---
app.get("/api/contacts", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  const { search } = req.query;
  const items = await listContacts(user.tenantId, search as string);
  res.json(items);
});

app.post("/api/contacts", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  const body = z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().email().optional().or(z.literal("")).or(z.null()),
    tags: z.array(z.string()).optional().nullable(),
    notes: z.string().optional().nullable()
  }).parse(req.body);
  try {
    await createContact(user.tenantId, body as any);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("CONTACT CREATE ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/contacts/:id", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  const body = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")).or(z.null()),
    tags: z.array(z.string()).optional().nullable(),
    notes: z.string().optional().nullable()
  }).parse(req.body);
  await updateContact(user.tenantId, req.params.id, body);
  res.json({ ok: true });
});

app.delete("/api/contacts/:id", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  await deleteContact(user.tenantId, req.params.id);
  res.json({ ok: true });
});

// --- Profile Update ---
app.put("/api/profile", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  const body = z.object({
    password: z.string().min(6).optional(),
    avatar: z.string().url().optional().or(z.literal("")),
  }).parse(req.body);

  const pool = await getPool();

  const updates: string[] = [];
  const request = pool.request().input("userId", user.userId);

  if (body.password) {
    const hash = await hashPassword(body.password);
    updates.push("PasswordHash = @hash");
    request.input("hash", hash);
  }

  if (body.avatar !== undefined) {
    updates.push("Avatar = @avatar");
    request.input("avatar", body.avatar || null);
  }

  if (updates.length > 0) {
    await request.query(`
      UPDATE omni.[User]
      SET ${updates.join(", ")}
      WHERE UserId = @userId
    `);
  }

  res.json({ ok: true });
});

// --- Ticket Status (Resolve/Reopen) ---
app.post("/api/conversations/:id/status", authMw, async (req, res) => {
  // @ts-ignore
  const user = req.user;
  const { status } = z.object({ status: z.enum(["OPEN", "RESOLVED", "PENDING"]) }).parse(req.body);

  const pool = await getPool();
  await pool.request()
    .input("tenantId", user.tenantId)
    .input("conversationId", req.params.id)
    .input("status", status)
    .query("UPDATE omni.Conversation SET Status = @status WHERE TenantId = @tenantId AND ConversationId = @conversationId");

  io.to(`tenant:${user.tenantId}`).emit("conversation:updated", {
    conversationId: req.params.id,
    timestamp: new Date().toISOString()
  });

  res.json({ ok: true });
});

// --- Configurações do Tenant (Default Provider, Token, Instance) ---
app.get("/api/settings", authMw, requireRole("ADMIN"), async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const pool = await getPool();

    // Get Default Provider
    const t = await pool.request()
      .input("tenantId", user.tenantId)
      .query("SELECT DefaultProvider FROM omni.Tenant WHERE TenantId=@tenantId");
    const defaultProvider = t.recordset[0]?.DefaultProvider || "GTI";

    // Get active connector for this provider to show config
    const c = await pool.request()
      .input("tenantId", user.tenantId)
      .input("provider", defaultProvider)
      .query(`
        SELECT TOP 1 cc.ConfigJson
        FROM omni.ChannelConnector cc
        JOIN omni.Channel ch ON ch.ChannelId = cc.ChannelId
        WHERE ch.TenantId=@tenantId AND cc.Provider=@provider AND cc.IsActive=1
      `);

    let config = {};
    if (c.recordset.length > 0) {
      try { config = JSON.parse(c.recordset[0].ConfigJson); } catch { }
    }

    res.json({ defaultProvider, config });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/settings", authMw, requireRole("ADMIN"), async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const body = z.object({
      defaultProvider: z.string(),
      instanceId: z.string().optional(),
      token: z.string().optional()
    }).parse(req.body);

    const pool = await getPool();

    // 1. Update Tenant Default Provider
    await pool.request()
      .input("tenantId", user.tenantId)
      .input("provider", body.defaultProvider)
      .query("UPDATE omni.Tenant SET DefaultProvider=@provider WHERE TenantId=@tenantId");

    // 2. Update/Create Connector for this provider
    // Logic: Find existing connector for this provider. If exists, update config. If not, create one.
    // For MVP simplicy, we'll try to find one.
    const current = await pool.request()
      .input("tenantId", user.tenantId)
      .input("provider", body.defaultProvider)
      .query(`
        SELECT TOP 1 cc.ConnectorId, cc.ConfigJson
        FROM omni.ChannelConnector cc
        JOIN omni.Channel ch ON ch.ChannelId = cc.ChannelId
        WHERE ch.TenantId=@tenantId AND cc.Provider=@provider AND cc.IsActive=1
      `);

    let configJson = "{}";
    let connectorId = "";

    if (current.recordset.length > 0) {
      connectorId = current.recordset[0].ConnectorId;
      try {
        const conf = JSON.parse(current.recordset[0].ConfigJson);
        // Update fields if provided
        if (body.instanceId) conf.instance = body.instanceId; // GTI uses 'instance', 'token'
        if (body.token) conf.token = body.token;
        // Official uses 'phoneNumberId', 'accessToken' - maybe map differently if provider=OFFICIAL?
        // User asked specifically for "token e id da instancia", which implies GTI terminology.
        // If Official, we might map token->accessToken, instance->phoneNumberId.
        if (body.defaultProvider === 'OFFICIAL') {
          if (body.token) conf.accessToken = body.token;
          if (body.instanceId) conf.phoneNumberId = body.instanceId;
        }

        configJson = JSON.stringify(conf);
      } catch { }
    } else {
      // We'll skip creation and assume user has a connector or will create one.
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/dashboard/stats", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const pool = await getPool();

    // 1. Conversas Abertas
    const openRes = await pool.request()
      .input("tenantId", user.tenantId)
      .query("SELECT COUNT(*) as count FROM omni.Conversation WHERE TenantId=@tenantId AND Status='OPEN'");

    // 2. Conversas Resolvidas (Total)
    const resolvedRes = await pool.request()
      .input("tenantId", user.tenantId)
      .query("SELECT COUNT(*) as count FROM omni.Conversation WHERE TenantId=@tenantId AND Status='RESOLVED'");

    // 3. Filas (Em espera)
    const queueRes = await pool.request()
      .input("tenantId", user.tenantId)
      .query("SELECT COUNT(*) as count FROM omni.Conversation WHERE TenantId=@tenantId AND QueueId IS NOT NULL AND AssignedUserId IS NULL AND Status='OPEN'");

    // 4. Mensagens Hoje
    const msgsRes = await pool.request()
      .input("tenantId", user.tenantId)
      .query(`
            SELECT COUNT(*) as count 
            FROM omni.Message 
            WHERE TenantId=@tenantId 
            AND CreatedAt >= CAST(GETDATE() AS DATE) 
            AND CreatedAt < CAST(DATEADD(day, 1, GETDATE()) AS DATE)
        `);

    res.json({
      open: openRes.recordset[0].count,
      resolved: resolvedRes.recordset[0].count,
      queue: queueRes.recordset[0].count,
      messagesToday: msgsRes.recordset[0].count
    });

  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Reatribuir conector de uma conversa (útil se mudou de provider) ---
app.post("/api/conversations/:id/reassign-connector", authMw, requireRole("ADMIN"), async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const conversationId = req.params.id;

    const pool = await getPool();

    // 1. Get Tenant Default Provider
    const t = await pool.request()
      .input("tenantId", user.tenantId)
      .query("SELECT DefaultProvider FROM omni.Tenant WHERE TenantId=@tenantId");
    const defaultProvider = t.recordset[0]?.DefaultProvider || "GTI";

    // 2. Find active connector for this provider
    const c = await pool.request()
      .input("tenantId", user.tenantId)
      .input("provider", defaultProvider)
      .query(`
        SELECT TOP 1 cc.ConnectorId
        FROM omni.ChannelConnector cc
        JOIN omni.Channel ch ON ch.ChannelId = cc.ChannelId
        WHERE ch.TenantId=@tenantId AND cc.Provider=@provider AND cc.IsActive=1
      `);

    if (c.recordset.length === 0) return res.status(400).json({ error: "Nenhum conector ativo para o provider padrão" });
    const newConnectorId = c.recordset[0].ConnectorId;

    // 3. Update ExternalThreadMap
    await pool.request()
      .input("conversationId", conversationId)
      .input("tenantId", user.tenantId)
      .input("newConnectorId", newConnectorId)
      .query(`
        UPDATE omni.ExternalThreadMap
        SET ConnectorId = @newConnectorId
        WHERE ConversationId = @conversationId AND TenantId = @tenantId
      `);

    res.json({ ok: true, provider: defaultProvider });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Template Management (HSM) ---
app.get("/api/templates", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const items = await listTemplates(user.tenantId);
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/templates", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    const body = z.object({
      name: z.string().min(1),
      content: z.string().min(1),
      variables: z.array(z.string()).optional()
    }).parse(req.body);

    await createTemplate(user.tenantId, body.name, body.content, body.variables || []);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/templates/:id", authMw, async (req, res) => {
  try {
    const user = (req as any).user as { tenantId: string };
    await deleteTemplate(user.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

server.listen(process.env.PORT ?? 3001, () => {
  console.log("API on", process.env.PORT ?? 3001);
});
