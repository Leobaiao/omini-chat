import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { z } from "zod";

import { getPool } from "./db.js";
import { authMw, requireRole } from "./mw.js";
import { signToken, verifyPassword, assertAgentSeatAvailable, assertTenantActive } from "./auth.js";
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const orch = new Orchestrator([new TriageBot()]);

const adapters = {
  gti: new GtiAdapter(),
  official: new OfficialAdapter()
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

    io.to(conversationId).emit("message:new", {
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

    // Emitir via Socket.IO para atualização em tempo real
    io.to(conversationId).emit("message:new", {
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
  await createContact(user.tenantId, body as any);
  res.json({ ok: true });
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

server.listen(process.env.PORT ?? 3001, () => {
  console.log("API on", process.env.PORT ?? 3001);
});
