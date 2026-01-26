const express = require("express");
const { run, Agent } = require("@openai/agents");
const mongoose = require("mongoose");
const { auth } = require("../utils/users");
const { UserChatsModel } = require("../Models/Schemes");

const router = express.Router();

const chatAgent = Agent.create({
  name: "Truckly Assistant",
  apiKey: process.env.OPENAI_API_KEY,
  instructions: `
You are a helpful assistant for a fleet management platform.
Keep replies concise and in Italian.
If the user asks to do actions, acknowledge and explain what info you need next.
`
});

const topicAgent = Agent.create({
  name: "Topic Extractor",
  apiKey: process.env.OPENAI_API_KEY,
  instructions: `
Given a conversation, return a JSON array of up to 10 short keywords in Italian.
Return ONLY valid JSON (no prose).
`
});

const titleAgent = Agent.create({
  name: "Chat Title",
  apiKey: process.env.OPENAI_API_KEY,
  instructions: `
Create a short Italian chat title (2-5 words).
No numbers, no times, no punctuation.
If a vehicle name/plate is present, include it.
Examples:
- "Ricerca veicolo Stralis Landi"
- "Report consumi flotta"
Return ONLY the title string.
`
});

const buildHistory = (messages) => {
  return messages.map((msg) => {
    const role = msg.role === "assistant" ? "assistant" : msg.role;
    const type = role === "user" ? "input_text" : "output_text";
    return {
      role,
      content: [{ type, text: msg.content }]
    };
  });
};

const normalizeKeywords = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((k) => String(k).trim()).filter(Boolean).slice(0, 10);
    }
  } catch {}
  return value
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10);
};

router.post("/chat", auth, async (req, res) => {
  try {
    const { chatId, message } = req.body || {};
    if (!message || !message.content || typeof message.content !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing message.content" });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    let chat = null;
    if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      chat = await UserChatsModel.findOne({ _id: chatId, userId }).lean();
    }

    if (!chat) {
      chat = await UserChatsModel.create({
        userId,
        companyId: req.user?.companyId || null,
        messages: []
      });
    }

    await UserChatsModel.updateOne(
      { _id: chat._id },
      { $push: { messages: { role: "user", content: message.content } } }
    );

    const refreshed = await UserChatsModel.findById(chat._id).lean();
    const history = buildHistory(refreshed.messages);
    const result = await run(chatAgent, history);

    const assistantReply = result.finalOutput || "";
    await UserChatsModel.updateOne(
      { _id: chat._id },
      { $push: { messages: { role: "assistant", content: assistantReply } } }
    );

    const messageCount = refreshed.messages.length + 1;
    const shouldUpdateTopic =
      !Array.isArray(refreshed.topicKeywords) || refreshed.topicKeywords.length === 0 || messageCount % 6 === 0;

    if (shouldUpdateTopic) {
      const topicPrompt = `Conversation:\n${refreshed.messages
        .slice(-12)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")}`;
      const topicResult = await run(topicAgent, [
        { role: "user", content: [{ type: "input_text", text: topicPrompt }] }
      ]);
      const keywords = normalizeKeywords(topicResult.finalOutput || "");
      let title = null;
      try {
        const titleResult = await run(titleAgent, [
          { role: "user", content: [{ type: "input_text", text: topicPrompt }] }
        ]);
        title = String(titleResult.finalOutput || "").trim() || null;
      } catch {}
      await UserChatsModel.updateOne(
        { _id: chat._id },
        { $set: { topicKeywords: keywords, topicUpdatedAt: new Date(), title } }
      );
    }

    return res.json({
      chatId: chat._id,
      reply: { role: "assistant", content: assistantReply }
    });
  } catch (err) {
    console.error("[agents/chat] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

router.get("/chats", auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const chats = await UserChatsModel.find({ userId })
      .sort({ updatedAt: -1 })
      .select({ messages: { $slice: -1 }, topicKeywords: 1, title: 1, updatedAt: 1 })
      .lean();
    return res.json({ chats });
  } catch (err) {
    console.error("[agents/chats] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

router.get("/chats/:id", auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const chatId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }
    const chat = await UserChatsModel.findOne({ _id: chatId, userId }).lean();
    if (!chat) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ chat });
  } catch (err) {
    console.error("[agents/chat:get] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

router.delete("/chats/:id", auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const chatId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }
    const result = await UserChatsModel.deleteOne({ _id: chatId, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[agents/chat:delete] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

module.exports = router;
