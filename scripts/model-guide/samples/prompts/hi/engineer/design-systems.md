---
profession: engineer
task: design-systems
language: hi
deliverable: presentations
---

## Prompt

आप पार्सलसेतु (ParcelSetu) में tech lead हैं। यह एक काल्पनिक shipping-label API है जिसे भारत के ऑनलाइन merchants इस्तेमाल करते हैं। ग्राहक shipment events (`label.created`, `shipment.in_transit`, `shipment.delivered`, `shipment.rto_initiated` आदि) पाने के लिए HTTPS webhook endpoints register करते हैं। अभी एक cron job हर मिनट events table को poll करता है और ग्राहकों के endpoints पर synchronously, एक-एक करके, POST करता है। अगले हफ़्ते engineering leadership review में आपको redesign प्रस्तुत करना है।

**मौजूदा समस्याएँ (incident log से)**

- पिछले महीने एक merchant का endpoint हर कॉल पर 30 सेकंड बाद time out हो रहा था। Delivery क्रमिक होने के कारण बाकी सभी merchants के events 47 मिनट तक देर से पहुँचे।
- फ़ेल deliveries केवल अगले cron tick पर retry होती हैं, बिना backoff के। दो merchants ने शिकायत की कि उनके अपने outage के दौरान retries से उन पर "DDoS" हो गया।
- Merchants delivery history नहीं देख सकते और events replay नहीं कर सकते।
- एक ही shipment के events कभी-कभी गलत क्रम में पहुँचते हैं (`delivered`, `in_transit` से पहले)।

**आंकड़े**

| मीट्रिक | मान |
|---|---|
| प्रति दिन events (औसत, आज) | 20,00,000 |
| अपेक्षित वृद्धि | 18 महीनों में 3× |
| पीक घंटा (त्योहारी सेल के दिन) | औसत दर का 10× |
| Registered endpoints | 18,000 (लगभग 1,200 को 80% ट्रैफ़िक मिलता है) |
| प्रति event औसत attempts (retries सहित) | 1.3 |
| प्रति delivery attempt संग्रहीत आकार (payload, headers, response अंश) | 2 KB |
| Delivery history का आवश्यक retention | 30 दिन |

PM की ड्राफ़्ट आवश्यकताएँ कहती हैं: "पीक लोड लगभग 2,300 events/s है। Delivery exactly-once होनी चाहिए। Retries 24 घंटे तक।"

**बाधाएँ**

- टीम: 4 backend engineers, और सिस्टम एक तिमाही में ship होना है।
- मौजूदा stack: managed relational database (PostgreSQL), managed orchestrator पर containers, और एक managed message queue जो दूसरी टीम पहले से इस्तेमाल करती है; सब कुछ एक ही भारतीय cloud region (मुंबई) में। टीम में किसी ने भी production में self-hosted distributed log नहीं चलाया है।
- Security: merchants को यह verify कर पाना चाहिए कि webhook पार्सलसेतु से ही आया है।

**डिलीवर करें:** markdown में एक design review deck, 10 से 12 स्लाइड, लगभग 1,200 शब्दों के भीतर। `### Slide n: शीर्षक`, फिर bullets, फिर एक पंक्ति का speaker note। इसमें शामिल हों:

- Problem statement और goals या non-goals, ड्राफ़्ट आवश्यकताओं में जिससे आप असहमत हैं उसे सुधारते हुए।
- Capacity अनुमान (अभी और 18 महीने बाद का throughput, औसत और पीक पर, और delivery history का storage), गणना दिखाते हुए।
- Architecture: components और data flow, एक स्लाइड पर सरल ASCII या Mermaid diagram के रूप में।
- Delivery semantics, ordering, retry और backoff नीति, per-endpoint isolation और circuit breaking, signing, और replay API।
- Queueing layer के लिए कम से कम दो विकल्प, स्पष्ट सिफ़ारिश और trade-offs के साथ।
- Rollout और migration योजना, observability (SLOs और alerts), और सबसे बड़े जोखिम।

## A strong answer

- Corrects the peak figure: 20,00,000 ÷ 86,400 ≈ 23 events/s on average, about 230/s at a 10× peak, and about 700/s at peak after 3× growth. The PM's 2,300/s is 10× too high, though it can be kept as deliberate headroom if the answer says so.
- Rejects exactly-once delivery over HTTP and proposes at-least-once with a stable event ID or idempotency key, plus guidance for merchants on deduplication.
- Sizes storage: about 26 lakh (2.6M) attempts per day × 2 KB ≈ 5.2 GB a day, or about 156 GB over 30 days today and roughly 470 GB at 3× growth. Picks a partitioning or TTL approach to match.
- Solves head-of-line blocking with per-endpoint queues or concurrency limits, short timeouts, and exponential backoff with jitter over 24 hours plus circuit breaking. Addresses per-shipment ordering, for example by keying on shipment ID (AWB) or including sequence numbers and timestamps.
- Recommends a queueing option that fits the team (for example the existing managed queue, or a Postgres outbox, rather than a self-hosted log), adds HMAC signing with timestamp and replay protection, and gives a phased migration with SLOs. The slide format is followed.

## Card

brief: एक shipping API के webhook delivery सिस्टम का redesign engineering leadership के सामने रखें, ड्राफ़्ट आवश्यकताएँ सुधारते और capacity आँकते हुए।
given:
- मौजूदा design: हर मिनट events poll करके endpoints पर एक-एक करके POST करने वाला cron job
- Incident log: देरी, retries, history और क्रम की 4 समस्याएँ
- आंकड़े: volume, वृद्धि, पीक, endpoints, attempts, record के आकार और retention के 7 मीट्रिक
- PM की ड्राफ़्ट आवश्यकताएँ: पीक लोड, delivery guarantee और retry अवधि
- बाधाएँ: टीम और समय-सीमा, मौजूदा stack और अनुभव, और signing की आवश्यकता
asked:
- Problem statement और goals या non-goals, ड्राफ़्ट आवश्यकताओं को सुधारते हुए
- Throughput और storage के capacity अनुमान, गणना सहित
- Architecture, एक स्लाइड पर diagram के साथ
- Delivery semantics, ordering, retries, isolation, circuit breaking, signing और replay
- Queueing के कम से कम दो विकल्प, सिफ़ारिश और trade-offs के साथ
- Rollout और migration, observability, और सबसे बड़े जोखिम
limit: 10 से 12 स्लाइड, लगभग 1,200 शब्दों के भीतर, Markdown स्लाइड फ़ॉर्मैट
hard: ड्राफ़्ट आवश्यकताओं को आंकड़ों और HTTP की सीमाओं से परखना है, और design को छोटी टीम के कौशल और एक तिमाही की समय-सीमा में फ़िट होना है।

## Scorecard

- Computes ~23 events/s average, ~230/s peak, ~700/s peak after 3× growth; calls 2,300/s 10× high (or stated headroom)
- Rejects exactly-once over HTTP; proposes at-least-once with stable event IDs and merchant dedup guidance
- Sizes storage ~5.2 GB/day (26 lakh × 2 KB), ~156 GB/30 days, ~470 GB at 3×; partitions or TTL
- Per-endpoint isolation, short timeouts, jittered backoff over 24h, circuit breaking; per-shipment (AWB) ordering by key or sequence
- Recommends the managed queue or a Postgres outbox over a self-hosted log; HMAC signing with timestamp, replay protection
- Gives a phased migration with SLOs, and a speaker note on every slide

## Scorecard, shown

- औसत ~23 events/s, पीक ~230/s, और 3× वृद्धि के बाद पीक ~700/s निकालता है; 2,300/s को 10× ज़्यादा बताता है (या स्पष्ट रूप से headroom मानता है)
- HTTP पर exactly-once को अस्वीकार करता है; स्थिर event ID के साथ at-least-once और merchants के लिए dedup मार्गदर्शन सुझाता है
- Storage आँकता है: ~5.2 GB/दिन (26 लाख × 2 KB), 30 दिन में ~156 GB, 3× पर ~470 GB; partitions या TTL
- Per-endpoint isolation, छोटे timeouts, 24 घंटे में jitter वाला backoff, circuit breaking; key या sequence से हर shipment (AWB) का क्रम
- Self-hosted log के बजाय managed queue या Postgres outbox की सिफ़ारिश; timestamp के साथ HMAC signing और replay से बचाव
- Phased migration और SLOs देता है, और हर स्लाइड पर speaker note
