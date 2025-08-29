import fetch from "node-fetch";

/**
 * Middleware that tracks events from a Telegraf bot
 * and sends them to a specified endpoint in a sanitized format.
 *
 * Captures messages, media, callbacks, inline queries, payments, and more.
 * Focuses on what the user actually selected, clicked, or triggered.
 *
 * @param {object} telegrafBot - Telegraf bot instance
 * @param {string} token - Auth token for telemetry endpoint
 * @param {string} endpoint - URL to send telemetry data to
 * @param {object} options - Configuration options
 * @param {boolean} [options.log=false] - Enable logging of sent payloads
 * @param {number} [options.maxTextLength=500] - Max length for text fields
 * @param {number} [options.timeoutMs=3000] - Timeout in milliseconds for fetch
 * @param {boolean} [options.includeRawUpdate=false] - Include raw update JSON
 * @returns {function} Telegraf middleware
 */
export const hippoTrack = (telegrafBot, token, endpoint, options = {}) => {
  const {
    includeRawUpdate = false,
    log = false,
    maxTextLength = 500,
    timeoutMs = 3000,
  } = options;

  telegrafBot.use(async (ctx, next) => {
    await next();

    try {
      const eventType = detectEventType(ctx);
      const safeData = safeCtx(ctx, telegrafBot, {
        includeRawUpdate,
        maxTextLength,
      });

      const payload = {
        ...safeData,
        event_type: eventType,
        tg_date: extractTgDate(ctx),
        app_date: Math.floor(Date.now() / 1000),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (log) {
          const json = JSON.stringify(payload);
          console.log(`[hippoTrack] Payload size: ${Buffer.byteLength(json, "utf8")} bytes`);
          console.log("[hippoTrack]:", payload);
        }
      } catch (error) {
        if (error.name === "AbortError") {
          console.error("[hippoTrack] Request timed out");
        } else {
          console.error("[hippoTrack] Error sending event:", error);
        }
      }
    } catch (error) {
      console.error("[hippoTrack] Error building payload:", error);
    }
  });
};

/**
 * Detects the type of Telegram update.
 */
function detectEventType(ctx) {
  const update = ctx.update;

  if (update.message) return "message";
  if (update.callback_query) return "callback_query";
  if (update.inline_query) return "inline_query";
  if (update.chosen_inline_result) return "chosen_inline_result";
  if (update.poll) return "poll";
  if (update.poll_answer) return "poll_answer";
  if (update.pre_checkout_query) return "pre_checkout_query";
  if (update.shipping_query) return "shipping_query";
  if (update.chat_join_request) return "chat_join_request";
  if (update.chat_member) return "chat_member";
  if (update.my_chat_member) return "my_chat_member";
  if (update.business_message) return "business_message";
  if (update.edited_business_message) return "edited_business_message";
  if (update.deleted_business_messages) return "deleted_business_messages";
  if (update.message_reaction) return "message_reaction";
  if (update.message_reaction_count) return "message_reaction_count";

  return "unknown";
}

/**
 * Extracts Telegram timestamp from context.
 */
function extractTgDate(ctx) {
  return (
    ctx.message?.date ??
    ctx.editedMessage?.date ??
    ctx.channelPost?.date ??
    ctx.editedChannelPost?.date ??
    ctx.callbackQuery?.message?.date ??
    ctx.businessMessage?.date ??
    ctx.editedBusinessMessage?.date ??
    ctx.chatMember?.date ??
    ctx.myChatMember?.date ??
    null
  );
}

/**
 * Extracts and sanitizes relevant information from Telegraf context.
 */
function safeCtx(ctx, bot, { includeRawUpdate, maxTextLength }) {
  const safeText = (text, max) =>
    typeof text === "string"
      ? text.slice(0, max)
      : typeof text === "object" && text !== null
        ? JSON.stringify(text).slice(0, max)
        : null;

  // bot info
  let botId = bot?.botInfo?.id ?? null;
  let botUsername = bot?.botInfo?.username ?? null;

  if (!botId || !botUsername) {
    const botFrom =
      ctx.update?.message?.from ??
      ctx.update?.callback_query?.message?.from ??
      ctx.update?.business_message?.from ??
      ctx.update?.edited_business_message?.from ??
      null;

    if (botFrom?.is_bot) {
      botId = botId ?? botFrom.id;
      botUsername = botUsername ?? botFrom.username;
    }
  }

  const payload = {
    bot: {
      id: botId,
      username: botUsername,
    },
    user: {
      id: ctx.from?.id ?? null,
      username: ctx.from?.username ?? null,
      first_name: ctx.from?.first_name ?? null,
      last_name: ctx.from?.last_name ?? null,
      language_code: ctx.from?.language_code ?? null,
    },
    chat: {
      id: ctx.chat?.id ?? null,
      type: ctx.chat?.type ?? null,
      title: ctx.chat?.title ?? null,
      username: ctx.chat?.username ?? null,
    },

    message: safeText(ctx.message?.text, maxTextLength),
    callback_query: safeText(ctx.callbackQuery?.data, maxTextLength),
    inline_query: safeText(ctx.inlineQuery?.query, maxTextLength),

    media_type: ctx.message?.photo
      ? "photo"
      : ctx.message?.video
        ? "video"
        : ctx.message?.document
          ? "document"
          : ctx.message?.sticker
            ? "sticker"
            : null,

    raw_update: includeRawUpdate
      ? (() => {
        try {
          const sanitized = sanitizeUpdate(ctx.update, maxTextLength);
          return JSON.stringify(sanitized);
        } catch {
          return null;
        }
      })()
      : null,
  };

  return removeNulls(payload);
}

/**
 * Sanitize update: trim long text fields, strip media (keep IDs only).
 */
function sanitizeUpdate(update, maxTextLength = 500) {
  function sanitize(obj) {
    if (Array.isArray(obj)) return obj.map(sanitize);

    if (obj && typeof obj === "object") {
      const out = {};
      for (const [key, val] of Object.entries(obj)) {
        // 1. Limit strings
        if (typeof val === "string") {
          out[key] =
            val.length > maxTextLength
              ? val.slice(0, maxTextLength) + "...[truncated]"
              : val;
          continue;
        }

        // 2. Left only file_id
        if (
          [
            "photo",
            "video",
            "document",
            "voice",
            "sticker",
            "animation",
            "audio",
            "video_note",
            "new_chat_photo",
            "thumb",
            "thumbnail",
          ].includes(key)
        ) {
          if (Array.isArray(val)) {
            out[key] = val.map((v) => ({
              file_id: v.file_id,
              file_unique_id: v.file_unique_id,
            }));
          } else if (val && typeof val === "object") {
            out[key] = {
              file_id: val.file_id,
              file_unique_id: val.file_unique_id,
            };
          }
          continue;
        }

        // Recursion
        out[key] = sanitize(val);
      }
      return out;
    }

    return obj;
  }

  return sanitize(update);
}

/**
 * Recursively removes nulls and empty objects.
 */
function removeNulls(obj) {
  if (Array.isArray(obj)) return obj.map(removeNulls);
  if (typeof obj === "object" && obj !== null) {
    const cleaned = Object.fromEntries(
      Object.entries(obj)
        .map(([k, v]) => [k, removeNulls(v)])
        .filter(([_, v]) => v != null)
    );
    return cleaned;
  }
  return obj;
}
