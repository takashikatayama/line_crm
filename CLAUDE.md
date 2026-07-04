# CLAUDE.md — LINE Management Platform (Prototype)

## What this project is
Building an in-house **LINE management & analytics platform** on top of the LINE
Messaging API — essentially a self-built alternative to L-Step / L Message
(エルメ). Long-term goal: use it internally, then sell it as a multi-tenant SaaS.
**Right now we are only building the first prototype.** Do not build the SaaS/
multi-tenant/billing layers yet.

## The core concept (important — don't lose this)
LINE does NOT hand over a customer database. You build the DB yourself by making
this platform the account's **webhook endpoint**: every follow / message / tap
is POSTed to our server as an event, and we store it. That accumulated event log
IS the "customer database." Data only accrues from the moment our webhook goes
live — there is no historical backfill.

## Current milestone: the echo bot
Goal: prove the full round trip works — receive a webhook AND reply back.
This is the "hello world" and the top priority. Nothing else matters until a
message sent from a phone gets echoed back.

Then (milestone 2, only after echo works):
1. Store every incoming event (user id, type, text, timestamp) to a DB.
2. Store follow / unfollow events to build a customer list.
3. One plain web page (dashboard) that reads the DB and shows: follower count,
   customer list, running message log.

## Deliberately OUT of scope for the prototype
GPT auto-reply, broadcasts / push messages (they cost money per send), tags,
segments, step campaigns, rich menus, login/accounts, multi-tenant. Add later,
one at a time, after the loop is solid.

## Tech stack (keep it minimal)
- Node.js + Express, essentially one file for the server.
- `@line/bot-sdk` (handles webhook signature verification + sending).
- **SQLite** for storage (single file on disk, no DB server to install).
- **ngrok** for a temporary public HTTPS URL during local dev.
- One static HTML page for the dashboard, served by the same app.

## How the connection works (two directions)
- **Inbound (LINE → us):** the webhook. LINE POSTs events to our public
  `/webhook` URL. Verified using the **Channel secret**.
- **Outbound (us → LINE):** API calls (reply / push). Authenticated with the
  **Channel access token**.
- Reply messages use a short-lived `replyToken` from the webhook and are FREE.
  Push messages can be sent anytime but count against a paid monthly quota — so
  the prototype should use replies, not push.

## Credentials needed
- Channel secret — LINE Developers Console → channel → Basic settings tab.
- Channel access token — LINE Developers Console → channel → Messaging API tab →
  Issue (long-lived). Consider reissuing a fresh one.
- Store them in a `.env` file (never commit them). Env vars:
  `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`.

## Account situation (as of now)
- Test account: **OSM HOME | オスモ公式** (@792fhrsv), ~2 friends.
- It was previously connected to **L Message (エルメ)**, which occupied the
  webhook. L Message has now been DISCONNECTED to free the webhook slot.
- NOTE: the disconnect may take up to ~24h to fully propagate. If events don't
  arrive at first, wait and retry before assuming the code is broken.
- OPEN ISSUE / likely blocker: the developer's role on this account may not be
  Admin. If the **Messaging API** item is missing under Settings in the LINE
  Official Account Manager, that's a permissions problem — needs Admin rights or
  the keys handed over. Verify access to Messaging API before coding.
- Account tier (Verified / Premium / unverified) is NOT yet confirmed. This
  affects whether the full follower list can be fetched up front. Assume "no
  backfill, capture forward only" until confirmed.

## Setup / run steps
1. Confirm Messaging API is accessible (permission check above).
2. In LINE Official Account Manager → Settings → Response settings: Webhook = ON,
   Greeting message = OFF, and turn OFF the built-in auto-reply so LINE doesn't
   answer before our code.
3. `npm install express @line/bot-sdk better-sqlite3 dotenv`
4. Put credentials in `.env`.
5. Run the server (`node index.js`), then `ngrok http 3000`.
6. In LINE Official Account Manager → Settings → Messaging API: set Webhook URL
   to the ngrok HTTPS URL + `/webhook`, enable "Use webhook", click Verify.
7. Message the account from a phone → expect the echo back.

## Key LINE constraints to remember
- **One webhook URL per channel.** Only one tool can own it at a time (that's
  why L Message had to be disconnected).
- User ID from LINE is an opaque per-channel id — NOT phone/email/real name.
  Profile API gives display name, picture, status message, language only.
- Full follower list fetch is gated to Verified/Premium accounts.

## Working style for Claude Code in this repo
- Get the echo bot working end-to-end before adding storage or the dashboard.
- Keep the server small and readable; prefer one file until it grows.
- Never commit secrets; keep them in `.env` (gitignored).
- Ask before adding any feature from the "OUT of scope" list.
