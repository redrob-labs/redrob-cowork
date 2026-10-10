---
profession: recruiter
task: schedule-interviews
language: hi
deliverable: none
---

## Prompt

आप Gyaanpath Learning में recruiting coordinator हैं। Gyaanpath बेंगलुरु की एक ed-tech कंपनी है जिसकी product engineering team यूरोप और अमेरिका में फैली है। कंपनी अपनी global platform team के लिए **Senior Backend Engineer** भर्ती कर रही है। **सोमवार 26 अक्टूबर 2026** वाले सप्ताह में दो candidates का final-round video loop schedule कीजिए, फिर communications लिखिए। आप बेंगलुरु (IST, UTC+5:30, कोई DST नहीं) से काम करते हैं, लेकिन calls में शामिल नहीं होंगे; आपके working hours पर कोई पाबंदी नहीं है।

**Loop format**

- 45 मिनट के तीन sessions, हर candidate के लिए एक ही दिन, किसी भी क्रम में: System design (जेन डो), Coding (मैरी मेजर), Hiring manager (जॉन स्टाइल्स)।
- Sessions के बीच break कम से कम 15 मिनट और अधिकतम 30 मिनट, जब तक कोई accommodation कुछ और न कहे।
- सब कुछ हर व्यक्ति के local समय के 09:00–17:00 working hours के भीतर होना चाहिए।
- हर interviewer एक दिन में अधिकतम एक final-round session लेगा।

**Interviewers**

| Interviewer | Location | Busy (local समय) |
|---|---|---|
| जेन डो | Berlin | मंगल 27 अक्टूबर 13:00–15:00; गुरु 29 अक्टूबर पूरे दिन out of office |
| मैरी मेजर | New York | मंगल 27 अक्टूबर 11:00–12:00 |
| जॉन स्टाइल्स | New York | हर दिन 09:00–09:30 (standup) |

**Candidates**

| Candidate | Location | उपलब्धता | Notes |
|---|---|---|---|
| रिचर्ड रो | Lisbon | मंगल 27 या बुध 28 अक्टूबर | कोई नहीं |
| रिचर्ड माइल्स | Chicago | केवल मंगल 27 या गुरु 29 अक्टूबर | नीचे उनका email देखें |

**रिचर्ड माइल्स का email**

> "आगे बढ़ाने के लिए धन्यवाद! मुझे सुनने में कठिनाई होती है, तो क्या calls पर live captions चालू रह सकते हैं, और क्या coding problem बोलकर बताने के साथ लिखित रूप में भी share की जा सकती है? Sessions के बीच लंबे breaks (30 मिनट) से भी मदद मिलेगी। मैं चाहूँगा कि panel को बस यह पता हो कि क्या setup करना है, कारण नहीं।"

**CRM (मौजूदा)**

| Candidate | Stage | Last update |
|---|---|---|
| रिचर्ड रो | Onsite – to schedule | 14 अक्टूबर |
| रिचर्ड माइल्स | Onsite – to schedule | 16 अक्टूबर |

Video links के लिए placeholders इस्तेमाल करें: `https://meet.example.com/<id>`।

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. हर candidate के लिए schedule table: session, interviewer, UTC में start और end समय, candidate और हर interviewer का local समय, और आपके अपने calendar के लिए IST। संक्षेप में बताइए कि उस सप्ताह हर शहर पर कौन-सा UTC offset लागू है और क्यों।
2. छोटा explanation: आपने ये दिन और slots क्यों चुने, और कौन-से विकल्प आपने ख़ारिज किए।
3. हर candidate को confirmation email (हर एक अधिकतम 180 शब्द), जिसमें समय उनके अपने time zone में हों।
4. Panel के लिए note (अधिकतम 120 शब्द): logistics और accommodation setup।
5. CRM updates (stage, तारीख, notes) एक table में।

## A strong answer

- Uses the correct offsets for that week: the EU clock change on 25 Oct puts Berlin on UTC+1 and Lisbon on UTC+0, while the US change on 1 Nov leaves New York on UTC−4 and Chicago on UTC−5. Bengaluru is UTC+5:30 all year. All local and IST times are consistent with these offsets.
- Puts Richard Miles on Tue 27 Oct, since Jane Doe is out Thursday. His day can't start before 14:00 UTC (09:00 Chicago), and Jane's session has to fit in her 14:00–16:00 UTC window after her busy block. The schedule uses 30-minute breaks and avoids Mary Major's 15:00–16:00 UTC block, for example Jane 14:00–14:45, Stiles 15:15–16:00, Mary 16:30–17:15 UTC (19:30–20:15, 20:45–21:30, 22:00–22:45 IST).
- Puts Richard Roe on Wed 28 Oct, because the one-session-per-day rule means Tuesday's interviewers are taken by Miles, who has no other day. Every Roe session falls within all participants' hours, and Stiles avoids his 13:00–13:30 UTC standup. The coordinator's IST hours are not treated as a constraint.
- Arranges the accommodation (live captions, the coding prompt shared in writing, 30-minute breaks) and tells the panel only what to set up, without disclosing that Miles is hard of hearing, as he asked.
- The candidate emails are clear, warm and correct in local time, with links and what to expect. The CRM updates reflect the scheduled stage and the dates.
