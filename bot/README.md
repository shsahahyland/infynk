# infynk Teams Bot

Express webhook server that connects Microsoft Teams to the infynk knowledge system.

## How It Works

1. A user @mentions the bot in a Teams channel with a question
2. The bot strips the mention, forwards the question to `POST /ask` on the infynk backend
3. The response is formatted as an **Adaptive Card** showing the answer, sources, and confidence
4. The card is returned to the Teams channel

## Setup

### 1. Install & Run

```bash
cd bot
npm install
# Point to your infynk backend
export INFYNK_API_URL=http://localhost:8000
npm start
```

The bot listens on port **3978** by default (set `BOT_PORT` to change).

### 2. Expose via ngrok (for development)

Teams needs a public HTTPS URL to reach your bot:

```bash
ngrok http 3978
```

Copy the `https://xxxx.ngrok.io` URL.

### 3. Register as an Outgoing Webhook in Teams

1. Go to your Teams channel → **Manage channel** → **Connectors** / **Apps**
2. Choose **Outgoing Webhook**
3. Set:
   - **Name**: `infynk`
   - **Callback URL**: `https://xxxx.ngrok.io/api/messages`
4. Copy the security token (used for HMAC validation – not enforced in this MVP)
5. Save

### 4. Use it

In any channel message, type:

```
@infynk Where is authentication handled?
```

The bot will reply with an Adaptive Card containing the answer and sources.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BOT_PORT` | `3978` | Port the bot server listens on |
| `INFYNK_API_URL` | `http://localhost:8000` | URL of the infynk backend API |
