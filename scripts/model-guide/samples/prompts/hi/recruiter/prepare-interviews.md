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
- The final-round plan probes each finalist's weakest areas (Mary: OPS ≈ 3.08 after rescaling, and SAFE ≈ 3.17, the one nearest the bar; Jane: COMM) with the same structured questions and behavioural anchors for both.

## Card

brief: तीन candidates के first-round panel scorecards consolidate करें, final round के लिए दो चुनें, और final-round interview plan का draft बनाएँ।
given:
- Process के नियम: 4 competencies, 1–4 scale, SAFE पर 3.0 की सीमा, सिर्फ़ हुए interviews गिने जाएँ
- Scorecards: 9 forms, हर candidate के 3, interviewer comments सहित
- Form note: जॉन डो के rating form का header
- Interview calendar: 11 मई वाले सप्ताह के interviews का status
asked:
- 1–4 scale पर consolidated scorecard, हर computed column के method सहित
- Data-quality और fairness समस्याओं का issues log, हर एक पर की गई कार्रवाई
- कौन आगे बढ़ेगा और क्यों, hiring manager के pushback का जवाब सहित
- Final-round plan: interviewers, हर competency पर "4" वाले जवाब के साथ एक structured सवाल, हर candidate के लिए probe
limit: लगभग 1,200 शब्दों के भीतर, markdown में
hard: Scorecards में data-validity की छिपी समस्याएँ और ऐसे comments हैं जिन पर अमल करना भेदभाव होगा, और करीबी औसतों के लिए defensible method चाहिए।

## Scorecard

- Rescales John Doe's 1–5 ratings to 1–4 with a stated formula (e.g. 5 → 4, 4 → 3.25)
- Excludes Doe's card for Roe (interview cancelled): Roe's SAFE 2.5, below 3.0; notes it would be 3.0
- Flags Stiles' remark on Mary's marriage and children as improper, ignores it, asks all finalists the same on-call question
- Flags "like me at his age" and "from our own college" as affinity bias
- Advances Mary Major (≈ 3.50, SAFE ≈ 3.17) and Jane Doe (≈ 3.40, SAFE 3.75), method reproducible
- Final round probes weakest areas (Mary: OPS ≈ 3.08, SAFE nearest the bar; Jane: COMM), same questions and anchors

## Scorecard, shown

- जॉन डो की 1–5 ratings को बताए गए formula से 1–4 पर लाता है (जैसे 5 → 4, 4 → 3.25)
- रो के लिए डो का card हटाता है (interview cancelled): रो का SAFE 2.5, 3.0 से कम; बताता है कि card के साथ 3.0 होता
- मैरी की शादी और बच्चों पर स्टाइल्स की टिप्पणी को अनुचित बताकर अनदेखा करता है, सभी finalists से on-call पर एक ही सवाल
- "उसकी उम्र में मैं भी ऐसा था" और "हमारे ही college से" को affinity bias बताता है
- मैरी मेजर (≈ 3.50, SAFE ≈ 3.17) और जेन डो (≈ 3.40, SAFE 3.75) को आगे बढ़ाता है, method दोहराने योग्य
- Final round हर finalist के कमज़ोर क्षेत्र probe करता है (मैरी: OPS ≈ 3.08, और सीमा के पास SAFE; जेन: COMM), एक जैसे सवाल और anchors
