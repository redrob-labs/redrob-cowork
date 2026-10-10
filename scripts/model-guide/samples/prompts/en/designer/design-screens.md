---
profession: designer
task: design-screens
language: en
deliverable: web
---

## Prompt

You are the product designer at PawPath, a booking app for a chain of fictional veterinary clinics. Design the mobile appointment-booking flow for the Harbor Street clinic: the pet owner picks a service, then a vet, then a time slot, then confirms. It has to work at a 375 px viewport width.

**Brand tokens (from the brand team)**

```json
{
  "color.primary": "#7FD1AE",
  "color.primary.text": "#FFFFFF",
  "color.ink": "#1D2B33",
  "color.surface": "#FFFFFF",
  "color.muted": "#5E6B73",
  "radius.card": "12px",
  "font.family": "system-ui, sans-serif",
  "font.size.body": "16px"
}
```

The brand team asks for primary buttons in `color.primary` with `color.primary.text` labels. The app must meet WCAG 2.2 AA.

**Clinic data**

Clinic hours: Monday to Saturday, 09:00–17:00, closed for lunch 12:00–13:00.

| Service | Duration | Price | Who can perform |
|---|---|---|---|
| Wellness exam | 30 min | $65 | Any vet |
| Vaccination visit | 15 min | $40 | Any vet |
| Dental cleaning | 90 min | from $280 | Dr. Mary Major only |
| Exotic pet check-up | 45 min | $85 | Dr. Mary Major only |

| Vet | Works |
|---|---|
| Dr. Mary Major | Tue, Thu, Sat |
| Dr. Richard Miles | Mon–Sat |

Available slots returned by the API for Thursday:

```json
[
  {"vet": "Richard Miles", "service": "Exotic pet check-up", "start": "10:00"},
  {"vet": "Mary Major", "service": "Exotic pet check-up", "start": "11:00"},
  {"vet": "Mary Major", "service": "Dental cleaning", "start": "11:30"},
  {"vet": "Richard Miles", "service": "Wellness exam", "start": "12:30"},
  {"vet": "Richard Miles", "service": "Wellness exam", "start": "14:00"},
  {"vet": "Mary Major", "service": "Wellness exam", "start": "16:45"}
]
```

**Product requirements (from the PM, John Doe)**

- Show the price before the owner confirms; no surprises at the desk.
- Owners book about 70% wellness exams and vaccinations; make those fastest.
- Allow "Any available vet".
- Confirmation must show the date, time, vet, service, price and clinic address (12 Harbor Street, Example City).

**Deliver** (at most ~1,200 words of prose; code may run longer):

1. A single-file HTML/CSS prototype in one code block, with a little vanilla JS so the steps can be clicked through. Use the slot data above. Show only slots that are actually bookable, and make clear how the booking summary updates.
2. A design rationale: whether you used one screen with progressive sections or separate steps, and why; how you handle the "from" price; and where you departed from the brand team's instructions.
3. A list of the data problems you found and how the UI or the API should handle each one.

## A strong answer

- Notices that white text on #7FD1AE fails AA contrast (about 1.8:1). Keeps the brand colour but uses dark ink text on it, or a darker shade, and explains the departure.
- Filters out invalid slots: Richard Miles cannot do exotic check-ups; the 12:30 slot falls in the lunch closure; the 11:30 dental cleaning (90 min) runs into lunch; the 16:45 wellness exam (30 min) runs past 17:00. The answer explains each one and suggests fixing them in the API.
- Shows the "from $280" dental price honestly (for example, "from $280, final quote at visit") and gives a reason, which is in tension with the PM's no-surprises rule.
- The prototype runs as a single file at 375 px, works with a keyboard (visible focus, labelled controls, tap targets of at least 24 px), makes the common services quick to reach, and offers "Any available vet".
- The rationale for one screen versus separate steps is tied to the 70% fast-path requirement.

## Card

brief: Design and prototype a mobile vet-appointment booking flow at 375 px from brand tokens, clinic data and API slots, meeting WCAG 2.2 AA.
given:
- Brand tokens: 8 colour, radius and type tokens, plus the button-colour instruction
- Clinic hours: Monday to Saturday, 09:00–17:00, with a lunch closure
- Services: 4 services with duration, price and who can perform them
- Vet schedules: 2 vets and their working days
- Thursday slots: 6 slots returned by the API
- PM requirements: 4 rules on price, fast common services, any vet and confirmation details
asked:
- A single-file HTML/CSS/JS prototype using the slot data, showing only bookable slots
- A design rationale: one screen or steps, the "from" price, and departures from brand instructions
- A list of data problems and how the UI or API should handle each
limit: Up to about 1,200 words of prose, in Markdown; the code may run longer
hard: A brand instruction must be weighed against the accessibility requirement, API data must be checked against the clinic's rules, and an open-ended price tests the no-surprises goal.

## Scorecard

- Flags white on #7FD1AE (about 1.8:1) as failing AA; uses dark text or a darker shade, explained
- Drops Miles's exotic slot, 12:30 (lunch), 11:30 dental (runs into lunch), 16:45 wellness (past 17:00)
- Explains why each dropped slot is invalid and recommends fixing them in the API
- Shows "from $280" honestly, e.g. with a final-quote note, and addresses the no-surprises tension
- Prototype runs at 375 px, keyboard-usable (visible focus, labels, ≥24 px targets), offers "Any available vet"
- Ties the one-screen-or-steps choice to a fast path for the 70% wellness and vaccination bookings
