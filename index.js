/**
 * Middleware that tracks events from a Telegraf bot
 * and sends them to a specified endpoint in a sanitized format.
 *
 * Supports messages, media, callbacks, inline queries, chat events,
 * polls, payments, and more.
 */

export function hippoTrack(bot, token, endpoint, { log = false } = {}) {
  bot.use(async (ctx, next) => {
    const payload = safeCtx(ctx, bot);

    if (log) {
      console.log("[hippoTrack] sending payload:", payload);
    }

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Failed to send event:", err);
    }

    return next();
  });
}

/**
 * Detects the type of Telegram update.
 *
 * @param {*} ctx - Telegraf context object
 * @returns {string} Event type
 */
function detectEventType(ctx) {
  const update = ctx.update;

  if (update.message) {
    if (update.message.successful_payment) return "successful_payment";
    if (update.message.invoice) return "invoice";
    if (update.message.text) return "text_message";
    if (update.message.photo) return "photo_message";
    if (update.message.video) return "video_message";
    if (update.message.document) return "document_message";
    if (update.message.audio) return "audio_message";
    if (update.message.voice) return "voice_message";
    if (update.message.sticker) return "sticker_message";
    if (update.message.poll) return "poll_message";
    if (update.message.contact) return "contact_message";
    if (update.message.location) return "location_message";
    return "message";
  }
  if (update.edited_message) return "edited_message";
  if (update.channel_post) return "channel_post";
  if (update.edited_channel_post) return "edited_channel_post";
  if (update.inline_query) return "inline_query";
  if (update.chosen_inline_result) return "chosen_inline_result";
  if (update.callback_query) return "callback_query";
  if (update.shipping_query) return "shipping_query";
  if (update.pre_checkout_query) return "pre_checkout_query";
  if (update.poll) return "poll";
  if (update.poll_answer) return "poll_answer";
  if (update.my_chat_member) return "my_chat_member";
  if (update.chat_member) return "chat_member";
  if (update.chat_join_request) return "chat_join_request";

  return "unknown";
}

/**
 * Extracts and sanitizes relevant information from context and bot.
 *
 * @param {*} ctx - Telegraf context object.
 * @param {*} bot - Telegraf bot instance.
 * @returns {object} Sanitized payload ready for sending.
 */
function safeCtx(ctx, bot) {
  const eventType = detectEventType(ctx);

  const payload = {
    bot: {
      username: bot.botInfo?.username ?? null,
      id: bot.botInfo?.id ?? null,
    },
    user: {
      id: ctx.from?.id ?? null,
      username: ctx.from?.username ?? null,
    },
    chat: {
      id: ctx.chat?.id ?? null,
      type: ctx.chat?.type ?? null,
    },
    event_type: eventType,
    message: ctx.message?.text?.slice(0, 200) ?? null,
    callback_query: ctx.callbackQuery?.data?.slice(0, 200) ?? null,
    inline_query: ctx.inlineQuery?.query?.slice(0, 200) ?? null,
    tg_date:
      ctx.update?.message?.date ??
      ctx.update?.edited_message?.date ??
      ctx.update?.channel_post?.date ??
      ctx.update?.edited_channel_post?.date ??
      null,
    app_date: Math.floor(Date.now() / 1000),

    // Media & attachments
    media: {
      photo: ctx.message?.photo?.map((p) => p.file_id) ?? null,
      document: ctx.message?.document?.file_id ?? null,
      video: ctx.message?.video?.file_id ?? null,
      audio: ctx.message?.audio?.file_id ?? null,
      voice: ctx.message?.voice?.file_id ?? null,
      sticker: ctx.message?.sticker?.file_id ?? null,
      contact: ctx.message?.contact ?? null,
      location: ctx.message?.location ?? null,
      poll: ctx.message?.poll
        ? {
            question: ctx.message.poll.question,
            options: ctx.message.poll.options.map((o) => o.text),
          }
        : null,
    },

    // Financial events
    payment: ctx.message?.successful_payment
      ? {
          currency: ctx.message.successful_payment.currency,
          total_amount: ctx.message.successful_payment.total_amount,
          invoice_payload: ctx.message.successful_payment.invoice_payload,
          telegram_payment_charge_id:
            ctx.message.successful_payment.telegram_payment_charge_id,
          provider_payment_charge_id:
            ctx.message.successful_payment.provider_payment_charge_id,
        }
      : ctx.message?.invoice
      ? {
          title: ctx.message.invoice.title,
          description: ctx.message.invoice.description,
          currency: ctx.message.invoice.currency,
          total_amount: ctx.message.invoice.total_amount,
          start_parameter: ctx.message.invoice.start_parameter,
          payload: ctx.message.invoice.payload,
        }
      : ctx.preCheckoutQuery
      ? {
          id: ctx.preCheckoutQuery.id,
          currency: ctx.preCheckoutQuery.currency,
          total_amount: ctx.preCheckoutQuery.total_amount,
          payload: ctx.preCheckoutQuery.invoice_payload,
        }
      : ctx.shippingQuery
      ? {
          id: ctx.shippingQuery.id,
          payload: ctx.shippingQuery.invoice_payload,
          shipping_address: ctx.shippingQuery.shipping_address,
        }
      : null,

    // Raw update for debugging
    raw_update: (() => {
      try {
        // For financial events, include all safe fields
        if (eventType === "successful_payment" || eventType === "invoice" || eventType === "pre_checkout_query" || eventType === "shipping_query") {
          return JSON.stringify(ctx.update);
        }
        // For other events, truncate to 500 chars
        return ctx.update ? JSON.stringify(ctx.update).slice(0, 500) : null;
      } catch {
        return null;
      }
    })(),
  };

  /**
   * Recursively removes null values, empty arrays and empty objects.
   *
   * @param {any} obj
   * @returns {any} Cleaned object or null
   */
  function removeNulls(obj) {
    if (Array.isArray(obj)) return obj.map(removeNulls).filter((v) => v != null);
    if (typeof obj === "object" && obj !== null) {
      const cleaned = Object.fromEntries(
        Object.entries(obj)
          .map(([k, v]) => [k, removeNulls(v)])
          .filter(
            ([_, v]) => v != null && (!(Array.isArray(v) && v.length === 0))
          )
      );
      return Object.keys(cleaned).length > 0 ? cleaned : null;
    }
    return obj;
  }

  return removeNulls(payload);
}
