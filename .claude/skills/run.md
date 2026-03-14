---
name: run
description: Start the dev server and client for local testing
user_invocable: true
trigger: run it
---

Run both the game server and client for local testing:

1. Start the server in the background: `npm run dev:server`
2. Start the client in the background: `npm run dev:client`
3. Check both are running and report their URLs (server on :3001, client on :5173)
