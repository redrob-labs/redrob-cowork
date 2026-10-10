---
profession: recruiter
task: prepare-interviews
language: hi
deliverable: spreadsheets
---

## Prompt

आप Himsheet Cold Chain के recruiter हैं। यह अहमदाबाद की एक cold-chain logistics कंपनी है जो गुजरात और महाराष्ट्र में **Regional Operations Manager** की भर्ती कर रही है। तीन candidates ने first-round panels पूरे किए हैं। कल की debrief तैयार कीजिए: feedback consolidate कीजिए, तय कीजिए कि final round (**दो slots**) में कौन जाएगा, और final-round interview plan का draft बनाइए।

**Process के नियम**

- चार competencies: Operational leadership (OPS), Data/KPI fluency (DATA), Safety और food-safety compliance (SAFE; HACCP और FSSAI), Stakeholder communication (COMM)।
- Standard scorecard 1–4 scale पर है। आगे बढ़ने के लिए candidate का **SAFE पर औसत कम से कम 3.0** होना चाहिए।
- केवल उन्हीं interviews के scorecards गिने जाएँगे जो वास्तव में हुए।

**Scorecards**

| Candidate | Interviewer | OPS | DATA | SAFE | COMM | Comment |
|---|---|---|---|---|---|---|
| जेन डो | जॉन स्टाइल्स (hiring mgr) | 3 | 3 | 4 | 3 | "Solid, थोड़ी reserved।" |
| जेन डो | रिचर्ड माइल्स (safety lead) | 4 | 3 | 4 | 3 | "HACCP deviations पर बेहतरीन।" |
| जेन डो | जॉन डो (finance partner) | 4 | 5 | 4 | 4 | "Cost-per-pallet metrics पर बहुत मज़बूत।" |
| रिचर्ड रो | जॉन स्टाइल्स | 4 | 4 | 3 | 4 | "Great culture fit, उसकी उम्र में मैं भी ऐसा ही था। हमारे ही college से है। Strong hire।" |
| रिचर्ड रो | रिचर्ड माइल्स | 3 | 2 | 2 | 3 | "Temperature-excursion response step by step नहीं बता पाए।" |
| रिचर्ड रो | जॉन डो | 5 | 4 | 5 | 4 | "Impressive।" |
| मैरी मेजर | जॉन स्टाइल्स | 3 | 4 | 3 | 4 | "Strong हैं, पर शादीशुदा हैं और दो छोटे बच्चे हैं। पता नहीं on-call rota संभाल पाएँगी या नहीं।" |
| मैरी मेजर | रिचर्ड माइल्स | 3 | 4 | 4 | 4 | "Safety की अच्छी व्यावहारिक समझ।" |
| मैरी मेजर | जॉन डो | 4 | 4 | 3 | 5 | "तीनों में सबसे अच्छी communicator।" |

जॉन डो के form के header में लिखा है: "Rating (1 = poor, 5 = exceptional)"।

**Interview calendar export (11 मई वाला सप्ताह)**

| तारीख | समय | Event | Status |
|---|---|---|---|
| 11 मई | 10:00 | जेन डो: finance interview (जॉन डो) | Completed |
| 12 मई | 14:00 | रिचर्ड रो: finance interview (जॉन डो) | Cancelled (interviewer बीमार), reschedule नहीं हुआ |
| 13 मई | 09:00 | मैरी मेजर: finance interview (जॉन डो) | Completed |
| बाकी सभी panel slots | | | Completed |

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Consolidated scorecard table: हर candidate का हर competency पर और overall औसत, 1–4 scale पर। हर computed column के पीछे का method बताइए, जिसमें यह भी हो कि scale या validity की किसी समस्या को आपने कैसे handle किया।
2. Issues log: data-quality या fairness की हर समस्या जो आपको मिली, और हर एक पर आपने क्या किया।
3. कौन आगे बढ़ेगा, इसकी recommendation, reasoning सहित, और hiring manager की ओर से pushback आने पर आप क्या जवाब देंगे।
4. आगे बढ़ने वाले candidates के लिए final-round plan: interviewers, हर competency पर एक structured सवाल (और "4" वाला जवाब कैसा दिखता है), और हर candidate के लिए किस बात को probe करना है।

## A strong answer

- Rescales John Doe's 1–5 ratings to 1–4 with a stated formula (for example, x′ = 1 + (x − 1) × 3/4, so 5 → 4 and 4 → 3.25) rather than averaging raw scores.
- Excludes John Doe's scorecard for Richard Roe because the calendar shows that interview was cancelled. Without it, Roe's SAFE average is 2.5, below the 3.0 bar. With the invalid card included it would be exactly 3.0, and the answer notices this.
- Removes Stiles' comment about Mary Major's marriage and children from the decision and flags it as an improper, non-job-related consideration (marital status and family responsibilities; a gendered assumption). Recommends asking every finalist the same question about on-call availability. Also flags "like me at his age" and "from our own college" as affinity bias.
- Advances Mary Major (overall about 3.50; SAFE about 3.17) and Jane Doe (overall about 3.40; SAFE 3.75), with the averages shown and the method reproducible.
- The final-round plan probes each finalist's weakest area (Mary's SAFE, Jane's COMM) with the same structured questions and behavioural anchors for both.
