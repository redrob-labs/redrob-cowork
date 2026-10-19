/**
 * Radar: the bundled daily edition behind the "On the radar" banners ("The Front Page" for news,
 * "Everyone's Talking" for social) and their subpages. Written from public reporting checked on 19
 * October 2026; every story keeps the article it came from in `source` + `url`. This is a dated
 * editorial snapshot, not a
 * feed. The whole edition lives in this ONE module, shaped so a scheduled job can regenerate it by
 * rewriting `RADAR` alone: { asOf, news: { summary, stories[] }, social: { summary, stories[] } }.
 */
import type { Language } from "../../../i18n";

export type RadarFeed = "news" | "social";
export const RADAR_FEEDS: readonly RadarFeed[] = ["news", "social"];

export type RadarStory = {
  /** Stable identifier, unique across the edition. */
  id: string;
  /** Headline shown in English UI. */
  headline: string;
  /** Headline shown in Korean UI. */
  headlineKo: string;
  /** Two or three plain sentences in English. */
  summary: string;
  /** Two or three plain sentences in Korean. */
  summaryKo: string;
  /** Publication or outlet the story was reported by. */
  source: string;
  /** Original article, opened outside the app when present. */
  url?: string;
  /** ISO time the source published or last updated the story. */
  publishedAt: string;
};

export type RadarSection = {
  /** One to three short sentences on the day, shown in full on the banner and as the subpage lede, in English. */
  summary: string;
  /** The same overview in Korean. */
  summaryKo: string;
  /** Five to eight stories, most important first. */
  stories: readonly RadarStory[];
};

export type RadarEdition = {
  /** ISO time this edition was put together. */
  asOf: string;
  /** Today's most-read news. */
  news: RadarSection;
  /** What people are talking about on social media today. */
  social: RadarSection;
};

export const RADAR: RadarEdition = {
  asOf: "2026-10-19T09:00:00+09:00",
  news: {
    summary:
      "Cost-of-living protests turned violent in France and Italy. A fire killed four soldiers in Alberta on the eve of its referendum, Kenya confirmed another Ebola case and a super typhoon knocked out power on Guam.",
    summaryKo:
      "프랑스와 이탈리아에서 생활비 시위가 폭력 사태로 번졌어요. 앨버타는 주민투표 하루 전 군기지 화재로 군인 4명을 잃었고, 케냐에선 에볼라 확진자가 또 나왔어요. 슈퍼 태풍이 스친 괌은 곳곳이 정전됐어요.",
    stories: [
      {
        id: "news-france-unrest",
        headline: "Macron condemns \"unbridled\" violence as France sees new clashes",
        headlineKo: "마크롱, 프랑스 시위 폭력 사태 강하게 비판",
        summary:
          "President Emmanuel Macron addressed the nation on Oct 18 after cost-of-living protests became some of the worst urban violence in France in years. Nearly 2,400 people were arrested on Oct 17 and almost 1,000 police officers were hurt. Local authorities may ban some rallies, but there is no curfew or state of emergency.",
        summaryKo:
          "에마뉘엘 마크롱 대통령이 10월 18일 대국민 연설에서 생활비 항의 시위가 최근 몇 년 사이 최악의 도심 폭력으로 번졌다고 비판했어요. 10월 17일 하루에만 약 2,400명이 체포됐고 경찰 1,000명 가까이가 다쳤어요. 지자체가 일부 집회를 금지할 수 있게 했지만 통행금지나 비상사태 선포는 하지 않았어요.",
        source: "The Straits Times (AFP)",
        url: "https://www.straitstimes.com/world/europe/macron-condemns-shocking-scenes-of-violence-across-france",
        publishedAt: "2026-10-18T22:10:00Z",
      },
      {
        id: "news-milan-clashes",
        headline: "Milan sees a second day of clashes over living costs",
        headlineKo: "밀라노, 생활비 시위로 이틀째 충돌",
        summary:
          "Protesters threw bottles, ransacked stores and damaged property around Milan's Duomo square on Oct 18. Police have arrested more than 200 people since Oct 17, according to the Ansa news agency. Prime Minister Giorgia Meloni called a security meeting for Oct 19.",
        summaryKo:
          "10월 18일 밀라노 두오모 광장 일대에서 시위대가 병을 던지고 상점을 털며 시설을 부쉈어요. 안사 통신에 따르면 경찰은 10월 17일부터 200명 넘게 체포했어요. 조르자 멜로니 총리는 10월 19일 치안 회의를 소집했어요.",
        source: "The Straits Times (Reuters)",
        url: "https://www.straitstimes.com/world/europe/milan-police-clash-with-protesters-on-second-day-of-unrest",
        publishedAt: "2026-10-18T22:10:00Z",
      },
      {
        id: "news-wainwright-fire",
        headline: "Fire at an Alberta army base kills four soldiers",
        headlineKo: "캐나다 앨버타 군기지 화재로 군인 4명 사망",
        summary:
          "A fast-moving grass fire swept through a training exercise at CFB Wainwright, southeast of Edmonton, on Saturday. Four service members died and 39 people were taken to hospital, 19 of them in critical condition. The military says the fire was considered under control before strong winds spread it in seconds.",
        summaryKo:
          "토요일 에드먼턴 남동쪽 웨인라이트 기지에서 훈련 중 들불이 빠르게 번졌어요. 군인 4명이 숨지고 39명이 병원으로 옮겨졌는데, 이 중 19명이 위독해요. 군은 불길이 잡힌 줄 알았는데 강풍이 불면서 순식간에 번졌다고 밝혔어요.",
        source: "The Canadian Press",
        url: "https://ca.news.yahoo.com/ap-top-stories-october-19-233304540.html",
        publishedAt: "2026-10-18T23:33:00Z",
      },
      {
        id: "news-alberta-referendum",
        headline: "Alberta votes today on its place in Canada",
        headlineKo: "앨버타, 오늘 캐나다 분리 여부 묻는 주민투표",
        summary:
          "Albertans vote on Monday, Oct 19, in a referendum on separating from Canada. On the eve of the vote, labour leaders and the main federalist campaign held a unity rally, saying the Wainwright tragedy shows why the country should stay together. Some business leaders have warned about the economic risks of leaving.",
        summaryKo:
          "앨버타 주민들이 10월 19일 월요일, 캐나다에서 분리할지를 묻는 주민투표에 나서요. 투표 전날 노동계 지도자들과 연방 잔류 진영은 통합 집회를 열고 웨인라이트 참사가 함께 남아야 할 이유를 보여 준다고 말했어요. 일부 기업 경영자들은 분리가 가져올 경제적 위험을 경고했어요.",
        source: "The Canadian Press",
        url: "https://ca.news.yahoo.com/ap-top-stories-october-19-233304540.html",
        publishedAt: "2026-10-18T23:33:00Z",
      },
      {
        id: "news-kenya-ebola",
        headline: "Kenya confirms its eighth Ebola case",
        headlineKo: "케냐, 여덟 번째 에볼라 확진자 확인",
        summary:
          "Kenya's health director-general Patrick Amoth said on Oct 18 that one of 38 people tested that day was positive. The patient is a 49-year-old man who is not a health worker. The case adds to a regional outbreak that is still spreading.",
        summaryKo:
          "케냐 보건부 패트릭 아모스 국장은 10월 18일 그날 검사한 38명 중 1명이 양성이었다고 밝혔어요. 환자는 의료진이 아닌 49세 남성이에요. 주변 지역으로 번지고 있는 유행에 확진자가 한 명 더 늘었어요.",
        source: "The Straits Times (Reuters)",
        url: "https://www.straitstimes.com/world/kenya-confirms-eighth-ebola-case-as-regional-outbreak-spreads",
        publishedAt: "2026-10-18T22:10:00Z",
      },
      {
        id: "news-typhoon-champi",
        headline: "Super Typhoon Champi brushes Guam and cuts power",
        headlineKo: "슈퍼 태풍 참피, 괌 스치며 대규모 정전",
        summary:
          "Champi passed about 16 km south of Guam early on Oct 18 and was upgraded to a super typhoon about three hours later. The close pass caused widespread power outages across the island. The storm is heading north toward waters south of Okinawa, Japan.",
        summaryKo:
          "태풍 참피가 10월 18일 새벽 괌 남쪽 약 16km 지점을 지났고, 약 3시간 뒤 슈퍼 태풍으로 격상됐어요. 바짝 붙어 지나간 탓에 섬 곳곳이 정전됐어요. 태풍은 일본 오키나와 남쪽 해상을 향해 북상하고 있어요.",
        source: "Watchers",
        url: "https://watchers.news/2026/10/18/champi-briefly-reaches-super-typhoon-strength-after-its-closest-approach-to-guam-causes-widespread-outages/",
        publishedAt: "2026-10-18T15:45:00Z",
      },
      {
        id: "news-mclaren-sale",
        headline: "McLaren puts five champions' F1 cars up for sale",
        headlineKo: "맥라렌, 챔피언들이 몰던 F1 머신 5대 판매",
        summary:
          "McLaren is selling five working Formula One cars once driven by champions, including Lewis Hamilton and the late Ayrton Senna. One of them was also tested by actor Brad Pitt. The sale, through dealer Tom Hartley Jr, is expected to raise tens of millions of dollars.",
        summaryKo:
          "맥라렌이 루이스 해밀턴과 고 아일톤 세나 등 챔피언들이 몰던 F1 머신 5대를 실제로 달릴 수 있는 상태로 내놓아요. 그중 한 대는 배우 브래드 피트가 시험 주행하기도 했어요. 딜러 톰 하틀리 주니어를 통한 판매로 수천만 달러가 모일 것으로 보여요.",
        source: "The Straits Times",
        url: "https://www.straitstimes.com/sport/formula-one/mclaren-to-sell-five-f1-cars-all-driven-by-champions-and-one-by-brad-pitt",
        publishedAt: "2026-10-18T22:10:00Z",
      },
    ],
  },
  social: {
    summary:
      "The French unrest still fills your feeds and held three Weibo trending spots at once. Also going around: Airbnb checkout rulebooks, football clips and October sounds on TikTok.",
    summaryKo:
      "피드는 여전히 프랑스 시위 이야기로 가득하고, 웨이보 검색어 세 자리를 한꺼번에 차지했어요. 에어비앤비 퇴실 규칙, 미식축구 영상, 틱톡의 10월 음원도 많이 돌고 있어요.",
    stories: [
      {
        id: "social-weibo-france",
        headline: "France's unrest takes three spots on Weibo at once",
        headlineKo: "프랑스 시위, 웨이보 검색어 세 자리 동시 차지",
        summary:
          "Chinese social media followed the French protests closely, with three related topics on Weibo's trending list at the same time. The image that spread furthest was the 143-year-old town hall in Limoges burning as its clock tower fell. A photo of someone dressed as Batman in Lyon's burned tourist office also travelled widely.",
        summaryKo:
          "중국 소셜 미디어는 프랑스 시위를 자세히 지켜봤고, 웨이보 인기 검색어에 관련 주제가 동시에 세 개나 올랐어요. 가장 널리 퍼진 장면은 143년 된 리모주 시청이 불타며 시계탑이 무너지는 모습이었어요. 불탄 리옹 관광 안내소에 배트맨 차림으로 선 사람의 사진도 많이 공유됐어요.",
        source: "Trending on Weibo",
        url: "https://www.trendingonweibo.com/hotwords/france-town-hall-unrest-weibo/",
        publishedAt: "2026-10-18T09:03:00Z",
      },
      {
        id: "social-airbnb-chores",
        headline: "Travelers post the chores Airbnb hosts asked them to do",
        headlineKo: "에어비앤비 숙소의 황당한 퇴실 규칙, 영상으로 줄줄이",
        summary:
          "A wave of viral videos shows guests sharing receipts, doorbell camera clips and long rulebooks from short-term rental hosts. The checkout demands range from mowing the lawn to fines for leaving the dishwasher running. Short-term rentals are still doing well despite the backlash.",
        summaryKo:
          "숙박객들이 단기 임대 숙소에서 받은 영수증, 현관 카메라 영상, 긴 규칙집을 공유하는 영상이 크게 퍼지고 있어요. 잔디 깎기부터 식기세척기를 켜 둔 채 나가면 내는 벌금까지 퇴실 요구도 가지각색이에요. 이런 반발에도 단기 임대 시장은 여전히 잘되고 있어요.",
        source: "Forbes",
        url: "https://www.forbes.com/sites/maryroeloffs/2026/10/17/airbnb-hosts-shamed-over-outrageous-chores-but-short-term-rentals-are-thriving/",
        publishedAt: "2026-10-17T12:00:00Z",
      },
      {
        id: "social-tuten-tiptoe",
        headline: "Jaguars' Bhayshul Tuten brings the tip-toeing meme to the end zone",
        headlineKo: "재규어스 투텐, 유행 밈 '살금살금 걷기'로 터치다운 세리머니",
        summary:
          "Jacksonville running back Bhayshul Tuten celebrated a touchdown by acting out the viral tip-toeing meme. The clip quickly became one of the day's trending sports videos. Fans are sharing it side by side with the original meme.",
        summaryKo:
          "잭슨빌 러닝백 바이슐 투텐이 터치다운 후 유행 중인 '살금살금 걷기' 밈을 따라 했어요. 이 영상은 금세 그날 가장 많이 퍼진 스포츠 영상 중 하나가 됐어요. 팬들은 원래 밈과 나란히 붙여 공유하고 있어요.",
        source: "Bleacher Report",
        url: "https://bleacherreport.com/articles/25512719-watch-bhayshul-tuten-hit-viral-tip-toeing-meme-trending-video-jaguars-td-celebration",
        publishedAt: "2026-10-18T16:13:00Z",
      },
      {
        id: "social-duke-trainer",
        headline: "A Duke player's sideline shove draws wide criticism",
        headlineKo: "듀크대 선수, 트레이너 밀친 영상에 비판 쏟아져",
        summary:
          "Video of a Duke football player pushing a female athletic trainer aside while a teammate lay injured spread widely on Saturday night. His attorney has since spoken up to defend him. The clip has started a debate about conduct on the field.",
        summaryKo:
          "토요일 밤, 듀크대 미식축구 선수가 다친 동료 곁에 있던 여성 트레이너를 밀쳐 내는 영상이 크게 퍼졌어요. 이후 선수의 변호사가 나서서 그를 옹호했어요. 이 영상을 두고 경기장에서의 태도에 대한 논쟁이 일고 있어요.",
        source: "Yardbarker",
        url: "https://www.yardbarker.com/college_football/articles/attorney_defends_duke_football_player_after_he_smacked_female_trainer_away/s1_17616_44443658",
        publishedAt: "2026-10-18T18:02:00Z",
      },
      {
        id: "social-mora-liverpool",
        headline: "Gilberto Mora's thumbs-up to Liverpool fans goes viral",
        headlineKo: "힐베르토 모라, 리버풀 팬에게 '엄지 척' 영상 화제",
        summary:
          "A short clip shows the young midfielder giving a thumbs-up to a Liverpool shirt held up by fans. It spread quickly because of recent reports linking him to the club. Fans are reading a lot into a few seconds of video.",
        summaryKo:
          "젊은 미드필더 힐베르토 모라가 리버풀 유니폼을 든 팬들에게 엄지를 들어 보이는 짧은 영상이 올라왔어요. 최근 리버풀 이적설이 나온 터라 영상이 빠르게 퍼졌어요. 팬들은 몇 초짜리 영상에 큰 의미를 두고 있어요.",
        source: "This Is Anfield",
        url: "https://www.thisisanfield.com/2026/10/gilberto-mora-liverpool-shirt-approval-viral-video/",
        publishedAt: "2026-10-18T09:54:00Z",
      },
      {
        id: "social-tiktok-october",
        headline: "October sounds and costume walks take over TikTok",
        headlineKo: "틱톡은 지금 10월 음원과 핼러윈 의상 영상",
        summary:
          "\"Hello, October\" and \"we fell in love in october\" are the most-used sounds in recent videos. Costume reveals keep landing on the Ramalama drum hit. Partner dances are back too, set to a slowed Jersey Club beat.",
        summaryKo:
          "요즘 영상에서 가장 많이 쓰이는 음원은 'Hello, October'와 'we fell in love in october'예요. 핼러윈 의상 공개 영상은 'Ramalama' 드럼 박자에 맞춰 짠 하고 등장하는 방식이 대세예요. 느리게 튼 저지 클럽 비트에 맞춘 커플 댄스도 다시 유행하고 있어요.",
        source: "SocialPilot",
        url: "https://www.socialpilot.co/blog/tiktok-trends",
        publishedAt: "2026-10-15T16:49:00Z",
      },
    ],
  },
};

/** The section shown for a feed. */
export function radarSection(edition: RadarEdition, feed: RadarFeed): RadarSection {
  return feed === "news" ? edition.news : edition.social;
}

/** Narrows a route param to a known feed, or null for anything else. */
export function radarFeedFromParam(param: string | undefined): RadarFeed | null {
  return param === "news" || param === "social" ? param : null;
}

/** `/radar/news` or `/radar/social`. */
export function radarPath(feed: RadarFeed): string {
  return `/radar/${feed}`;
}

/** The localized overview for a banner or subpage lede. */
export function radarSummary(section: RadarSection, locale: Language): string {
  return locale === "ko" ? section.summaryKo : section.summary;
}

/** The localized headline and summary for one story. */
export function radarStoryText(story: RadarStory, locale: Language): { headline: string; summary: string } {
  return locale === "ko"
    ? { headline: story.headlineKo, summary: story.summaryKo }
    : { headline: story.headline, summary: story.summary };
}
