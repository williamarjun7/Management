# Realtime Stability Report

**Generated:** 2026-05-17
**Scope:** WebSocket subscriptions, reconnect handling, replayMissedEvents, channel lifecycle

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│                  realtime.ts                          │
│                                                       │
│  initRealtime()                                       │
│    ├── insforge.realtime.connect()                    │
│    ├── window.addEventListener('online')              │
│    ├── contestLeadership()                            │
│    ├── startHealthCheck() ← NEW                       │
│    └── cleanupStaleSubscriptions interval (5 min)     │
│                                                       │
│  subscribe*() functions                               │
│    ├── insforge.realtime.subscribe(channel)           │
│    ├── replayMissedEvents(channel)                    │
│    ├── insforge.realtime.on(channel, handler)         │
│    └── trackChannel(channel, cleanup)                 │
│                                                       │
│  handleOnline (reconnect)                             │
│    ├── backoffWithJitter() delay                      │
│    ├── insforge.realtime.connect()                    │
│    ├── reconnectToChannels() ← NEW                    │
│    ├── reset reconnectCount ← FIXED                   │
│    └── processMutationQueue()                         │
│                                                       │
│  healthCheck (30s interval) ← NEW                     │
│    └── Detects silent WS drops via lastMessageAt      │
│                                                       │
│  shutdownCleanup                                      │
│    ├── stopHealthCheck() ← NEW                        │
│    ├── remove 'online' listener                       │
│    └── clear reconnectTimeout                         │
└───────────────────────────────────────────────────────┘
```

---

## Hardening Applied

### 1. Subscription Re-Establishment on Reconnect (C3)

**Before:** Reconnect handler only called `insforge.realtime.connect()` + `processMutationQueue()`. Channel subscriptions were NOT re-established, relying entirely on the SDK auto-resubscribing (which most SDKs don't).

**After:** A `subscribedChannelSet` tracks all active channel keys. On reconnect, `reconnectToChannels()` iterates this set and calls `insforge.realtime.subscribe(key)` for each. This ensures all previously subscribed channels are re-established.

**Files Changed:**
- `src/lib/realtime.ts`: Added `subscribedChannelSet`, `reconnectToChannels()`, updated `trackChannel()`/`removeChannel()` to maintain the set.

### 2. WebSocket Health Monitoring (C4)

**Before:** No WebSocket close/error handlers. The only reconnect trigger was the browser `window.online` event. Silent connection drops were never detected.

**After:** A periodic health check (`startHealthCheck()`) runs every 30 seconds. It tracks `tracking.lastMessageAt` — updated on every message. If no messages received for > 60 seconds while channels are subscribed, it proactively reconnects.

**Files Changed:**
- `src/lib/realtime.ts`: Added `healthCheckTimer`, `startHealthCheck()`, `stopHealthCheck()`, `MAX_SILENT_MS = 60000`.

### 3. Reconnect Count Reset on Success (H5)

**Before:** `reconnectCount` monotonically increased across the page lifetime. Backoff grew without bound, eventually reaching the maximum 5s for every reconnect.

**After:** `reconnectCount` is reset to 0 on successful `insforge.realtime.connect()` in both the initial connect and reconnect paths.

### 4. Live Message Deduplication (M7)

**Before:** The `seenEventIds` Set was only used during `replayMissedEvents()`. Live WebSocket messages had no dedup — duplicate server-sent events were processed as fresh.

**After:** `processSocketMessage()` now checks `payload.id` against `seenEventIds` and skips duplicates, the same way replay does.

### 5. String Cursor Comparison Fix (M8)

**Before:** `String(event.id) > String(newCursor)` — lexicographic comparison. IDs like "9" > "10" evaluated as `true`, potentially skipping events during replay.

**After:** `Number(event.id) > Number(newCursor)` — numeric comparison ensures correct ordering regardless of string length.

### 6. shutdownRealtime Called on App Unmount (M6)

**Before:** `shutdownRealtime()` existed but was never called from the root App component. The cleanup interval and active channels Map persisted indefinitely on unmount.

**After:** `App.tsx` now calls `initRealtime()` in the mount effect and `shutdownRealtime()` in the cleanup, ensuring proper teardown.

**Files Changed:**
- `src/App.tsx`: Added `initRealtime()`/`shutdownRealtime()` imports and usage.

---

## Remaining Risks

| Risk | Severity | Description |
|------|----------|-------------|
| SDK-level auto-resubscribe unknown | LOW | The fix assumes `insforge.realtime.subscribe()` re-registers interest on an already-connected client. If the SDK requires unsubscribe-then-subscribe, the current approach may silently fail. |
| No WebSocket `onclose`/`onerror` | MEDIUM | The health check detects drops reactively (up to 60s delay). Native WebSocket events would be faster. This depends on the InsForge SDK exposing these events. |
| replayMissedEvents not cancelable | LOW | If the component unmounts during replay, the replay continues to completion. Uses `.catch()` but no `AbortSignal`. |

---

## Channel Health Metrics

| Metric | Implementation |
|--------|---------------|
| Channel count | `activeChannels.size` |
| Per-channel message count | `ChannelInfo.messageCount` |
| Per-channel error count | `ChannelInfo.errorCount` |
| Last message timestamp | `ChannelInfo.lastMessageAt` |
| Stale channel cleanup | 5 min interval, 30 min stale threshold |
| Silent disconnection detection | Health check every 30s, 60s silent threshold |

---

## Subscription Lifecycle

```
Component Mount
  → subscribe*()
    → insforge.realtime.subscribe(channelKey)
    → replayMissedEvents(channelKey)
    → insforge.realtime.on(channelKey, handler)
    → trackChannel(channelKey, cleanupFn)
    → subscribedChannelSet.add(channelKey)
    → returns cleanup function

Component Unmount
  → cleanup function
    → removeChannel(channelKey)
      → subscribedChannelSet.delete(channelKey)
      → activeChannels.delete(channelKey)
    → insforge.realtime.off(channelKey, handler)
    → insforge.realtime.unsubscribe(channelKey)

Reconnect (online or health check)
  → insforge.realtime.connect()
  → reconnectToChannels()
    → for each key in subscribedChannelSet
      → insforge.realtime.subscribe(key)

Stale Channel Cleanup (5 min interval)
  → for channels with age > 30 min
    → unsubscribe + delete from activeChannels
    → subscribedChannelSet.delete(key)
```
