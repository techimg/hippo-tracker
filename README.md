# HippoTrack - Telegram Bot Event Tracker

HippoTrack is a middleware for [Telegraf](https://telegraf.js.org/) that tracks Telegram bot events and sends them to a specified endpoint in a sanitized format. It supports messages, media, callbacks, inline queries, chat events, polls, payments, and more.

---

## Features

- Tracks **all major Telegram updates**:
  - Messages (`text`, `photo`, `video`, `sticker`, `voice`, `poll`, `location`, `contact`, `document`)
  - Edited messages
  - Channel posts
  - Inline queries
  - Callback queries
  - Chat member updates
  - Poll answers
  - Chat join requests
- Tracks **financial events** safely:
  - `invoice`
  - `successful_payment`
  - `pre_checkout_query`
  - `shipping_query`
  - All financial fields are safe (no card numbers or CVV)
- **Media support**: automatically extracts `file_id` for photos, videos, documents, audio, stickers
- **Sanitized payloads**: removes nulls and empty arrays/objects
- **Raw update logging**:
  - Truncated to 500 characters for general events
  - Full safe fields for financial events
- Easy to integrate with any HTTP endpoint

---

## Installation

```bash
npm install @hippobots/tracker
```

## Usage

```javascript

import { Telegraf } from "telegraf";
import { hippoTrack } from "./hippoTrack.js";

// Bot Init
const bot = new Telegraf(process.env.BOT_TOKEN);

// Tracker
hippoTrack(bot, process.env.TRACK_TOKEN, process.env.TRACK_URL, { log: true });


// Main Code
// ...
// ...


// Bot Start
bot.start((ctx) => ctx.reply("Hello! Bot is active."));
bot.launch();
```

## Payload Structure

{
  "bot": { "username": "mybot", "id": 123456789 },
  "user": { "id": 987654321, "username": "example_user" },
  "chat": { "id": 111111111, "type": "private" },
  "event_type": "text_message",
  "message": "Hello world",
  "callback_query": null,
  "inline_query": null,
  "tg_date": 1693113600,
  "app_date": 1693113610,
  "media": {
    "photo": ["file_id1", "file_id2"],
    "video": null,
    "document": null,
    "audio": null,
    "voice": null,
    "sticker": null,
    "contact": null,
    "location": null,
    "poll": null
  },
  "payment": null,
  "raw_update": "{...truncated update or full payment info...}"
}


## Notes

*Financial safety*: Telegram API never sends card numbers, CVV, or bank details. Only safe fields such as ```total_amount```, ```currency```, and transaction IDs are included.

*Raw update*:

- Provides a safe snapshot for debugging or analytics.

- Truncated for normal events, full safe details for payments.

## Contributing

Feel free to submit issues or pull requests.

## License

MIT