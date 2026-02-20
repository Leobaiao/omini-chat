import { Router } from "express";
import { resolveConversationForInbound, saveInboundMessage } from "../services/conversation.js";
import { Orchestrator, TriageBot } from "../agents.js";
import { loadConnector } from "../utils.js"; // Needs to be created or moved if it exists

const router = Router();
const orch = new Orchestrator([new TriageBot()]);

router.post("/whatsapp/:provider/:connectorId/*", async (req, res, next) => {
    try {
        const provider = String(req.params.provider).toLowerCase();
        const connectorId = req.params.connectorId;

        const connector = await loadConnector(connectorId);
        const adapters = req.app.get("adapters");
        const adapter = adapters[provider];

        if (!adapter) return res.status(404).send("Unknown provider");

        const inbound = adapter.parseInbound(req.body, connector);
        if (!inbound) return res.status(200).send("ignored");

        const conversationId = await resolveConversationForInbound(inbound, connector.ConnectorId, connector.ChannelId);
        await saveInboundMessage(inbound, conversationId);

        const io = req.app.get("io");
        if (io) {
            io.to(`tenant:${inbound.tenantId}`).emit("message:new", {
                conversationId,
                senderExternalId: inbound.externalUserId,
                text: inbound.text ?? `[${inbound.mediaType}]`,
                mediaType: inbound.mediaType,
                mediaUrl: inbound.mediaUrl,
                direction: "IN"
            });

            io.to(`tenant:${inbound.tenantId}`).emit("conversation:updated", {
                conversationId,
                lastMessage: inbound.text ?? `[${inbound.mediaType}]`,
                direction: "IN",
                timestamp: new Date().toISOString()
            });
        }

        const decisions = await orch.run("TriageBot", inbound.text ?? "[media]", {
            tenantId: inbound.tenantId,
            conversationId,
            externalSenderId: inbound.externalUserId
        });

        return res.status(200).json({ ok: true, conversationId, decisions });
    } catch (error) {
        next(error);
    }
});

router.post("/external/webchat/message", async (req, res, next) => {
    try {
        const { connectorId } = req.body;
        if (!connectorId) return res.status(400).json({ error: "Missing connectorId" });

        const connector = await loadConnector(connectorId);
        const adapters = req.app.get("adapters");
        const adapter = adapters.webchat;

        const inbound = adapter.parseInbound(req.body, connector);
        if (!inbound) return res.status(400).json({ error: "Invalid payload" });

        const conversationId = await resolveConversationForInbound(inbound, connector.ConnectorId, connector.ChannelId);
        await saveInboundMessage(inbound, conversationId);

        const io = req.app.get("io");
        if (io) {
            io.to(`tenant:${inbound.tenantId}`).emit("message:new", {
                conversationId,
                senderExternalId: inbound.externalUserId,
                text: inbound.text ?? `[${inbound.mediaType}]`,
                mediaType: inbound.mediaType,
                mediaUrl: inbound.mediaUrl,
                direction: "IN"
            });
            io.to(conversationId).emit("message:new", {
                conversationId,
                senderExternalId: inbound.externalUserId,
                text: inbound.text ?? `[${inbound.mediaType}]`,
                mediaType: inbound.mediaType,
                mediaUrl: inbound.mediaUrl,
                direction: "IN"
            });
        }

        res.json({ ok: true, conversationId });
    } catch (error) {
        next(error);
    }
});

export default router;
