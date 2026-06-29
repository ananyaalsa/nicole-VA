# Nicole — Morning Integration Setup

Everything is built and tested. To turn each integration **on**, you just need to
create a developer app per provider, copy its **Client ID + Client Secret** into
`server/.env`, and restart the server. Anything you leave blank shows as
**"Coming soon / not configured"** in the Integrations page and Nicole simply
says she can't do it yet — nothing breaks.

> **The OAuth redirect URI is identical for all five providers:**
>
> ```
> LOCAL:  http://localhost:4000/api/integrations/callback
> PROD:   https://YOUR_DOMAIN/api/integrations/callback   (= SERVER_PUBLIC_URL + /api/integrations/callback)
> ```
>
> Paste it **byte-for-byte** (scheme, host, port, path, no trailing slash). A
> mismatch is the #1 cause of `redirect_uri_mismatch`.

Do them in any order; each is independent. **Restart the server after editing `.env`.**

---

## 1. Google (Calendar + Gmail + Meet)

Scopes the code requests (enable the matching APIs):
- `https://www.googleapis.com/auth/calendar.events` → enable **Google Calendar API**
- `https://www.googleapis.com/auth/gmail.modify` → enable **Gmail API**
- `https://www.googleapis.com/auth/userinfo.email` + `openid` (OpenID; no API to enable)

1. Open <https://console.cloud.google.com> and sign in.
2. Top bar → project dropdown → **New Project** → name it "Nicole" → **Create** → select it.
3. **APIs & Services → Library** → search **"Google Calendar API"** → **Enable**.
4. Back to **Library** → search **"Gmail API"** → **Enable**.
5. **APIs & Services → OAuth consent screen** → User Type = **External** → **Create**.
6. App name = "Nicole", user support email + developer contact = your email → **Save and Continue**.
7. **Scopes** step → **Add or remove scopes** → add these three → **Update** → **Save and Continue**:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/userinfo.email`
8. **Test users** step → **+ Add users** → add the EXACT Gmail address you'll log in with → **Save**.
   ⚠️ Skip this and you get "access_denied / app not verified".
9. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
10. Application type = **Web application**, name = "Nicole web".
11. **Authorized redirect URIs → + Add URI** → paste exactly:
    `http://localhost:4000/api/integrations/callback`
12. **Create** → copy **Client ID** and **Client secret**.
13. `.env`:
    ```
    GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
    GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
    ```

⚠️ **Gotchas**
- While the app is in **Testing**, Google **expires refresh tokens after 7 days** → Nicole loses Google access weekly. For durable use, **Publish** the app (sensitive/restricted scopes need verification).
- Refresh tokens only return because the code sends `access_type=offline` + `prompt=consent` — don't change that.
- Only listed test users can connect until the app is verified.

---

## 2. Notion (search notes + create pages)

No scopes in the URL — capabilities are set in the integration UI. The code uses **Read content + Insert content**.

1. Open <https://www.notion.so/my-integrations> → **New integration**.
2. Name = "Nicole", associate with your workspace.
3. Integration type = **Public** (required for OAuth; Internal only gives a static token).
4. **Capabilities**: tick **Read content** + **Insert content** → Save.
5. In **Redirect URIs**, add exactly: `http://localhost:4000/api/integrations/callback`
6. Copy the **OAuth client ID** and **OAuth client secret**.
7. `.env`:
   ```
   NOTION_CLIENT_ID=xxxxxxxx
   NOTION_CLIENT_SECRET=secret_xxxxxxxx
   ```

⚠️ **Gotcha** — Notion only sees pages you **share** with it. Open any Notion page → **•••** → **Connections → Add connections → Nicole**. Without this, `search_notion` returns empty and new pages have nowhere to nest.

---

## 3. Todoist (tasks)

Scope the code requests: `data:read_write`.

1. Open <https://developer.todoist.com/appconsole.html> and sign in.
2. **Create a new app** → name = "Nicole" → create.
3. **OAuth redirect URL** → paste exactly: `http://localhost:4000/api/integrations/callback`
   (Todoist validates this on token exchange.)
4. Copy **Client ID** and **Client secret**.
5. `.env`:
   ```
   TODOIST_CLIENT_ID=xxxxxxxx
   TODOIST_CLIENT_SECRET=xxxxxxxx
   ```

⚠️ **Gotcha**: the code stores Todoist tokens as non-expiring. If connections die after ~1h, check the app's token settings (disable refresh-token rotation).

---

## 4. Slack (post + read messages)

Bot scopes the code requests: `chat:write, channels:read, groups:read, users:read, channels:history`.

1. Open <https://api.slack.com/apps> → **Create New App → From scratch**.
2. App Name = "Nicole", pick your workspace → **Create App**.
3. **OAuth & Permissions** → **Scopes → Bot Token Scopes → Add an OAuth Scope** for each:
   `chat:write`, `channels:read`, `groups:read`, `users:read`, `channels:history`
4. **Redirect URLs → Add New Redirect URL** → paste exactly → **Save URLs**:
   `http://localhost:4000/api/integrations/callback`
5. **Basic Information → App Credentials** → copy **Client ID** + **Client Secret**.
6. `.env`:
   ```
   SLACK_CLIENT_ID=xxxxxxxx.xxxxxxxx
   SLACK_CLIENT_SECRET=xxxxxxxx
   ```

⚠️ **Gotcha**: to post to a channel, invite the bot — in Slack run `/invite @Nicole` in that channel, else `not_in_channel`. Bot tokens don't expire.

---

## Env vars summary

Add/confirm these in `server/.env`, then restart:

```env
# --- Integration encryption key (optional locally, REQUIRED for prod) ---
# Generate once and keep it STABLE — changing it makes stored tokens un-decryptable.
INTEGRATIONS_ENC_KEY=

# --- Public base URL of THIS server (used to build the OAuth redirect URI) ---
SERVER_PUBLIC_URL=http://localhost:4000

# --- Google (Calendar + Gmail + Meet) ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# --- Notion ---
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# --- Todoist ---
TODOIST_CLIENT_ID=
TODOIST_CLIENT_SECRET=

# --- Slack ---
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

Generate the encryption key:

```bash
# Git Bash / macOS / Linux
openssl rand -hex 32
```
```powershell
# Windows PowerShell (no openssl)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

**Notes**
- `INTEGRATIONS_ENC_KEY` is optional locally (falls back to a key derived from `JWT_SECRET`). Set a real 32-byte key for production, and don't change it after connecting accounts (existing tokens become un-decryptable — just reconnect if you do).
- Any provider left blank is skipped gracefully ("not configured").
- `DATABASE_URL`, `GEMINI_API_KEY`, `JWT_SECRET`, `PORT`, `FRONTEND_URL` from the base build stay as-is. Tokens are stored encrypted in the `nicole2_integrations` Postgres table (created automatically on boot).

---

## How to test once keys are in

1. `npm run dev` in `server/`, then `npm run dev` in `web/`.
2. Log in → open your profile (avatar, top-right) → **Integrations** tab.
3. Click **Connect** on a provider → a popup opens the provider's consent → approve → popup closes and the card flips to **Connected**.
4. Start Talk and try by voice:
   - "What's on my calendar today?"
   - "Add a task to call the lender tomorrow."
   - "Draft an email to sam@acme.com about the proposal." (drafts freely)
   - "Send it." (Nicole confirms first before sending — see safety note below)

## Safety note (read this)

Confirm-before-acting on **irreversible** actions (send email, post to Slack,
book a meeting that invites people) is enforced two ways:
1. **In Nicole's prompt** — she previews the action and waits for your "yes".
2. **In code** — the relay holds those tool calls and only runs them after you
   confirm by voice (so a mis-heard word can't auto-send an email).

Reads and easily-undone actions (checking your calendar, drafting, playing music,
adding a task) run instantly with a short spoken confirmation.
