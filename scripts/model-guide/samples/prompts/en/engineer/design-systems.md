---
profession: engineer
task: design-systems
language: en
deliverable: presentations
---

## Prompt

You are the tech lead at Parcelly, a fictional shipping-label API used by online merchants. Customers register HTTPS webhook endpoints to receive shipment events (`label.created`, `shipment.in_transit`, `shipment.delivered`, and so on). Today, a cron job polls the events table every minute and POSTs to customer endpoints synchronously, one at a time. You need to present a redesign to the engineering leadership review next week.

**Current problems (from the incident log)**

- Last month one merchant's endpoint took 30 s to time out on every call. Because delivery is sequential, all other merchants' events were delayed by up to 47 minutes.
- Failed deliveries are retried only on the next cron tick, with no backoff. Two merchants complained about being "DDoSed" by retries during their own outage.
- Merchants cannot see delivery history or replay events.
- Events for the same shipment sometimes arrive out of order (`delivered` before `in_transit`).

**Numbers**

| Metric | Value |
|---|---|
| Events per day (average, today) | 2,000,000 |
| Expected growth | 3× within 18 months |
| Peak hour | 10× the average rate |
| Registered endpoints | 18,000 (about 1,200 receive 80% of the traffic) |
| Average attempts per event (including retries) | 1.3 |
| Stored size per delivery attempt (payload, headers, response excerpt) | 2 KB |
| Required retention of delivery history | 30 days |

The PM's draft requirements say: "Peak load is about 2,300 events/s. Delivery must be exactly-once. Retries for up to 24 hours."

**Constraints**

- Team: 4 backend engineers, and the system has to ship in one quarter.
- The current stack is a managed relational database (PostgreSQL), containers on a managed orchestrator, and a managed message queue already used by another team. Nobody on the team has run a self-hosted distributed log in production.
- Security: merchants must be able to verify that a webhook came from Parcelly.

**Deliver** a design review deck in markdown, 10 to 12 slides, at most ~1,200 words. Use `### Slide n: title`, then bullets, then a one-line speaker note. Include:

- Problem statement and goals or non-goals, correcting anything in the draft requirements you disagree with.
- Capacity estimates (throughput now and in 18 months, at average and peak, and storage for delivery history), with the arithmetic shown.
- The architecture: components and data flow, as a simple ASCII or Mermaid diagram on one slide.
- The delivery semantics, ordering, retry and backoff policy, per-endpoint isolation and circuit breaking, signing, and the replay API.
- At least two options considered for the queueing layer, with a clear recommendation and the trade-offs.
- Rollout and migration plan, observability (SLOs and alerts), and the top risks.

## A strong answer

- Corrects the peak figure: 2,000,000 ÷ 86,400 ≈ 23 events/s on average, about 230/s at a 10× peak, and about 700/s at peak after 3× growth. The PM's 2,300/s is 10× too high, though it can be kept as deliberate headroom if the answer says so.
- Rejects exactly-once delivery over HTTP and proposes at-least-once with a stable event ID or idempotency key, plus guidance for merchants on deduplication.
- Sizes storage: about 2.6M attempts per day × 2 KB ≈ 5.2 GB a day, or about 156 GB over 30 days today and roughly 470 GB at 3× growth. Picks a partitioning or TTL approach to match.
- Solves head-of-line blocking with per-endpoint queues or concurrency limits, short timeouts, and exponential backoff with jitter over 24 hours plus circuit breaking. Addresses per-shipment ordering, for example by keying on shipment ID or including sequence numbers and timestamps.
- Recommends a queueing option that fits the team (for example the existing managed queue, or a Postgres outbox, rather than a self-hosted log), adds HMAC signing with timestamp and replay protection, and gives a phased migration with SLOs. The slide format is followed.
