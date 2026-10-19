/** @jsxImportSource react */
import { ArrowRight, MessageCircle, Newspaper } from "lucide-react";
import { Link } from "react-router";

import { t, type Language } from "../../../i18n";
import { formatEditionStamp } from "./edition-clock";
import { RADAR, RADAR_FEEDS, radarPath, radarSection, radarSummary, type RadarFeed } from "./radar-edition";

/** Localized title for a Radar feed, shared by its banner and its subpage. */
export function radarTitle(feed: RadarFeed): string {
  return feed === "news" ? t("cowork.radar_news_title") : t("cowork.radar_social_title");
}

/** The banner gradient tone each feed wears, on the Featured banner's palette. */
export const RADAR_TONE: Record<RadarFeed, number> = { news: 1, social: 2 };

/** Decorative feed mark, top corner of the banner and the subpage header. */
export function RadarMark(props: { feed: RadarFeed }) {
  return (
    <span className="model-chart__radar-mark" aria-hidden="true">
      {props.feed === "news" ? <Newspaper aria-hidden /> : <MessageCircle aria-hidden />}
    </span>
  );
}

/** One Radar banner: today's overview for a feed, opening its subpage. */
function RadarBanner(props: {
  /** Which feed this banner opens. */
  feed: RadarFeed;
  /** Current application language. */
  locale: Language;
}) {
  const titleId = `radar-banner-${props.feed}-title`;
  const summaryId = `radar-banner-${props.feed}-summary`;
  return (
    <Link
      to={radarPath(props.feed)}
      className="model-chart__banner model-chart__radar-banner"
      data-tone={RADAR_TONE[props.feed]}
      data-feed={props.feed}
      aria-labelledby={titleId}
      aria-describedby={summaryId}
    >
      <span className="model-chart__glass" aria-hidden="true" />
      <span className="model-chart__banner-scrim" aria-hidden="true" />
      <RadarMark feed={props.feed} />
      <span className="model-chart__banner-eyebrow">
        {t("cowork.radar_edition", { time: formatEditionStamp(RADAR.asOf, props.locale) })}
      </span>
      <span id={titleId} className="model-chart__banner-title">{radarTitle(props.feed)}</span>
      <span id={summaryId} className="model-chart__radar-summary">
        {radarSummary(radarSection(RADAR, props.feed), props.locale)}
      </span>
      <span className="model-chart__radar-open" aria-hidden="true">
        {t("cowork.radar_open")}
        <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

/** "Radar": today's news and social banners side by side under the Featured banner. */
export function RadarBanners(props: {
  /** Current application language. */
  locale: Language;
}) {
  return (
    <section className="model-chart__section model-chart__radar" aria-labelledby="model-chart-radar">
      <h3 id="model-chart-radar" className="model-chart__heading">{t("cowork.radar_heading")}</h3>
      <div className="model-chart__radar-grid">
        {RADAR_FEEDS.map((feed) => (
          <RadarBanner key={feed} feed={feed} locale={props.locale} />
        ))}
      </div>
    </section>
  );
}
