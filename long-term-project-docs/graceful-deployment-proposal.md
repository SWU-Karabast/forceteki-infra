# Graceful Zero-Downtime Deployment Proposal

## Overview

Today, deploying a new build of the game server requires a maintenance window: new
games are blocked while the running server is replaced, because all lobby, game, and
matchmaking state lives in the memory of a single server process. This proposal
describes an architecture that lets us deploy new server builds with an **invisible
handoff** — players in active games and lobbies are never interrupted, and new games
begin on the new build immediately.

### Goals

- **No player-visible downtime.** In-progress games and lobbies continue uninterrupted
  across a deploy, including when a player refreshes the page or otherwise reconnects.
- **Immediate cutover for new games.** As soon as the new build is healthy, all newly
  created games, lobbies, and matchmaking run on it.
- **Safe, bounded drain of the old build.** The previous build keeps serving its
  existing games for a bounded window, then shuts down automatically.
- **Cost-controlled.** We run a single server in steady state and only pay for a second
  server during the short overlap while the old build drains.

### High-level idea

We run the server in one of two interchangeable **lanes** (call them lane A and lane B).
Only one lane is "active" at any given time; the other is idle (scaled to zero). A deploy
brings the new build up in the idle lane, flips new traffic over to it, and lets the old
lane continue serving its existing games until a fixed drain timeout elapses.

The key to an invisible handoff is **affinity**: every game "remembers" which lane hosts
it, and all of that game's traffic — its live socket connection, reconnections, and
game-scoped HTTP requests — is routed back to that same lane for as long as the lane is
running. New, un-scoped traffic always flows to whichever lane is currently active.

The following sections describe the major components: how traffic is routed to the right
lane, what the client and server need to do to maintain affinity, and how the deployment
lifecycle brings lanes up and drains them down.

---

## 1. Lane-based routing

All traffic continues to enter through a single hostname and a single load balancer. The
load balancer is configured with two target groups — one per lane — and routing rules
that decide which lane a given request reaches.

- **Two target groups.** Lane A and lane B each have their own target group. Each lane is
  an independently deployable service that registers into its own target group.
- **Lane affinity by request marker.** Requests that belong to a specific game carry a
  lane marker (a `lane` query parameter on the socket connection and on game-scoped HTTP
  requests). Routing rules send `lane=A` traffic to lane A's target group and `lane=B`
  traffic to lane B's target group. Because the marker is on the request itself, a fresh
  reconnection after a page refresh is routed back to the correct lane just like the
  original connection.
- **The "active" front door.** Requests with no lane marker — creating a lobby, entering
  matchmaking, loading the home page — are routed to whichever lane is currently active.
  This is a single routing rule that the deployment process "flips" from the old lane to
  the new lane at cutover. Flipping this rule takes effect immediately and does not depend
  on DNS changes.

Using a single hostname with a lane marker (rather than separate hostnames per lane) keeps
the setup simple: no additional DNS records or certificate changes are required, and the
site continues to operate under a single origin for authentication and cross-origin
purposes.

---

## 2. Connection and request affinity (client)

For affinity to work, the client must know which lane hosts each game and consistently
include that information on the relevant traffic.

- **Lane assignment.** When a game or lobby is created (via create-lobby, join-lobby, or
  matchmaking), the response identifies the lane that will host it. The client stores this
  lane and includes it in the game/lobby URL so that it survives a page refresh.
- **Socket connections.** The live game socket connects with the game's lane marker, so
  the connection — and any later reconnection — always lands on the hosting lane.
- **Game-scoped HTTP.** Requests tied to a specific game or lobby (for example, changing a
  deck or spectating) include the lane marker so they reach the hosting lane.
- **Lane-agnostic HTTP.** Requests that are not tied to an existing game (matchmaking,
  creating a lobby, home-page listings, account/preferences) omit the marker and therefore
  reach the active lane.

The practical effect is that a player mid-game can refresh, lose connectivity, or
reconnect at any time during the drain window and still be routed back to the exact server
hosting their game.

---

## 3. Server responsibilities

Each lane runs the same server build, with a small amount of additional awareness so the
two lanes coexist cleanly during a handoff.

- **Lane identity.** Each running server knows its own lane identity, which it uses to tag
  the games and lobbies it hosts.
- **Draining state.** When a lane becomes the "old" lane during a deploy, it stops
  accepting new games. In practice this happens naturally — new-game traffic is routed to
  the active lane once the front door is flipped — but the old lane also explicitly refuses
  any new-game requests that reach it, so no new games are ever started on a draining lane.
- **Readiness signal.** Each lane exposes a readiness/status endpoint reporting whether it
  is healthy, whether it is accepting new games, and how many games it is currently
  hosting. The deployment process uses this to confirm the new lane is ready before
  cutover and to observe the old lane draining.
- **Cross-lane home page.** During the overlap window, active games can exist on both
  lanes. The home page's "games in progress" and "available lobbies" listings are
  aggregated across both lanes: the active lane merges its own list with the other lane's,
  retrieved through an internal server-to-server request. Each listed game/lobby is tagged
  with its lane so that joining or spectating routes to the correct lane. When only one
  lane is running (the steady state), no aggregation is needed.
- **Requeue handling.** Requeue actions originating from a game on a draining lane are
  redirected to the active lane, so a player asking for another match always ends up in
  the active lane's matchmaking rather than the draining lane's.

---

## 4. Deployment lifecycle and draining

A deploy moves the system from "lane X active, lane Y idle" to "lane Y active, lane X
draining, then idle." The sequence is:

1. **Bring up the idle lane.** The new build is deployed into the currently idle lane and
   scaled up. The load balancer health checks it until it is confirmed ready.
2. **Flip the front door.** Once the new lane is ready, the active routing rule is switched
   to it. From this moment, all new games, lobbies, and matchmaking run on the new lane.
3. **Drain the old lane.** The old lane continues to host its existing games and to accept
   their reconnections and game-scoped traffic. It no longer receives any new games.
4. **Bounded shutdown.** After a fixed **30-minute** drain timeout, the old lane is scaled
   down to zero. Any games still running at that point are ended, and those players are
   shown a brief maintenance/handoff notice. In practice most games finish well within the
   window, so this force-close affects only long-running stragglers.

The 30-minute timeout is a fixed, predictable bound: it guarantees the old lane is fully
retired (and its cost reclaimed) within half an hour of every deploy, while giving the
large majority of active games time to conclude naturally.

### Automated lane selection

Selecting which lane to deploy into requires no manual per-deploy setting. The deploy
pipeline tracks which lane is currently active (via a stored pointer) and automatically
targets the other, idle lane for the new build, then flips the front door and updates the
pointer at the end. Triggering a deploy is therefore no different from today — there is no
setting for an engineer to toggle or remember, and the pipeline cannot accidentally deploy
into the live lane. The pipeline also guards against overlapping deploys: because a drain
can take up to 30 minutes, it will not deploy into a lane that is still draining a previous
release, ensuring a new handoff only begins once the prior one has fully completed.

---

## 5. Cost

- **Steady state:** exactly one lane runs; the other is scaled to zero and incurs no
  compute cost. This matches today's footprint.
- **During a deploy:** a second lane runs for at most the 30-minute drain window, after
  which it is scaled back to zero.
- **No new fixed infrastructure cost:** the design reuses the existing single load
  balancer and hostname. The additional target group, routing rules, and idle service
  definition do not incur compute charges while idle.

The only incremental cost is running a second server for up to 30 minutes per deploy.
