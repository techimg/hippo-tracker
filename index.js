import fetch from "node-fetch";

/**
 * Middleware that tracks events from a Telegraf bot
 * and sends them to a specified endpoint in a sanitized format.
 *
 * Captures messages, media, callbacks, inline queries, payments, and more.
 * Focuses on what the user actually selected, clicked, or triggered.
 *
 * @param {string} endpoint - URL to send telemetry data to
 * @param {object} options - Configuration options
 * @param {boolean} [options.log=false] - Enable logging of sent payloads
 * @param {number} [options.maxTextLength=500] - Max length for text fields
 * @param {number} [options.timeoutMs=3000] - Timeout in milliseconds for fetch
 * @param {boolean} [options.includeRawUpdate=false] - Include raw update JSON
 * @returns {function} Telegraf middleware
 */
export const hippoTrack = (bot, token, endpoint, options = {}) => {
  const {
    includeRawUpdate = false,
    log = false,
    maxTextLength = 500,
    timeoutMs = 3000,
  } = options;

  bot.use(async (ctx, next) => {
    // Always allow bot logic to proceed first
    await next();

    try {
      const eventType = detectEventType(ctx);
      const safeData = safeCtx(ctx, ctx.telegram, {
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
        const response = await fetch(endpoint, {
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
          console.log(
            "[hippoTrack]:",
            payload
          );
        }
      } catch (error) {
        console.error("[hippoTrack] Error sending event:", error);
      }
    } catch (error) {
      console.error("[hippoTrack] Error building payload:", error);
    }
  });
};

/**
 * Detects the type of Telegram update.
 *
 * @param {object} ctx - Telegraf context object
 * @returns {string} Event type
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
 *
 * @param {object} ctx - Telegraf context object
 * @returns {number|null} Unix timestamp from Telegram update
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
    null
  );
}

/**
 * Extracts and sanitizes relevant information from Telegraf context.
 * Focuses on user actions (messages, button clicks, inline queries).
 *
 * @param {object} ctx - Telegraf context object
 * @param {object} bot - Telegraf bot instance
 * @param {object} options - Configuration options
 * @param {number} options.maxTextLength - Max length for text fields
 * @param {boolean} options.includeRawUpdate - Include raw update in payload
 * @returns {object} Sanitized payload ready for sending
 */
function safeCtx(ctx, bot, { includeRawUpdate, maxTextLength }) {
  const safeText = (text, max) =>
    typeof text === "string" ? text.slice(0, max) : null;

  const payload = {
    bot: {
      username: bot?.botInfo?.username ?? null,
      id: bot?.botInfo?.id ?? null,
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

    // Only user-triggered actions (focus of analytics)
    message: safeText(ctx.message?.text, maxTextLength),
    callback_query: safeText(ctx.callbackQuery?.data, maxTextLength),
    inline_query: safeText(ctx.inlineQuery?.query, maxTextLength),

    raw_update: includeRawUpdate
      ? (() => {
        try {
          return ctx.update ? JSON.stringify(ctx.update) : null;
        } catch {
          return null;
        }
      })()
      : null,
  };

  return removeNulls(payload);
}

/**
 * Recursively removes nulls, empty arrays, and empty objects.
 *
 * @param {any} obj - Object to clean
 * @returns {any} Cleaned object or null
 */
function removeNulls(obj) {
  if (Array.isArray(obj)) return obj.map(removeNulls).filter((v) => v != null);
  if (typeof obj === "object" && obj !== null) {
    const cleaned = Object.fromEntries(
      Object.entries(obj)
        .map(([k, v]) => [k, removeNulls(v)])
        .filter(([_, v]) => v != null && (!(Array.isArray(v) && v.length === 0)))
    );
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  }
  return obj;
}
