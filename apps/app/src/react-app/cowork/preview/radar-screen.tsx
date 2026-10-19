/** @jsxImportSource react */
import { icons } from "@redrob-labs/ui";
import { ExternalLink } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Link, Navigate, useParams } from "react-router";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currentLocale, subscribeToLocale, t, type Language } from "../../../i18n";
import { openExternal } from "../connectors/cowork-connectors";
import { CoworkShell } from "../shell/cowork-shell";
import { formatEditionStamp } from "./edition-clock";
import { RADAR_TONE, RadarMark, radarTitle } from "./radar-banners";
import {
  RADAR,
  radarFeedFromParam,
  radarSection,
  radarStoryText,
  radarSummary,
  type RadarFeed,
  type RadarStory,
} from "./radar-edition";

/** The story's outlet, linking out to the original article when one is recorded. */
function StorySource(props: { story: RadarStory }) {
  const { story } = props;
  const url = story.url;
  if (!url) return <span className="cowork-radar-story__source">{story.source}</span>;
  const tip = t("cowork.radar_source_tip", { source: story.source });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            className="cowork-radar-story__source"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={tip}
            onClick={(event) => {
              // Same path as other external links in Cowork: the system browser on the desktop.
              event.preventDefault();
              openExternal(url);
            }}
          />
        }
      >
        {story.source}
        <ExternalLink aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/** One feed's subpage: a header with the edition time, then the day's ranked stories. */
export function RadarPage(props: {
  /** Which feed to show. */
  feed: RadarFeed;
  /** Current application language. */
  locale: Language;
}) {
  const section = radarSection(RADAR, props.feed);
  return (
    <div className="cowork-radar-page">
      <Link className="model-chart__back" to="/guide">
        {icons.back({ width: 16, height: 16, "aria-hidden": true })}
        {t("cowork.nav_guide")}
      </Link>
      <header className="cowork-radar-page__head" data-tone={RADAR_TONE[props.feed]} data-feed={props.feed}>
        <span className="cowork-radar-tint" aria-hidden="true" />
        <RadarMark feed={props.feed} />
        <span className="cowork-radar-page__eyebrow">{t("cowork.radar_heading")}</span>
        <h1 className="cowork-radar-page__title">{radarTitle(props.feed)}</h1>
        <p className="cowork-radar-page__lede">{radarSummary(section, props.locale)}</p>
        <time className="cowork-radar-page__meta" dateTime={RADAR.asOf}>
          {t("cowork.radar_updated", { time: formatEditionStamp(RADAR.asOf, props.locale) })}
        </time>
      </header>
      <ol className="cowork-radar-page__list" aria-label={t("cowork.radar_stories")}>
        {section.stories.map((story, index) => {
          const text = radarStoryText(story, props.locale);
          const headingId = `cowork-radar-story-${story.id}`;
          return (
            <li key={story.id}>
              <article className="cowork-radar-story__card" aria-labelledby={headingId}>
                <span className="cowork-radar-story__rank" aria-hidden="true">{index + 1}</span>
                <div className="cowork-radar-story__body">
                  <h2 id={headingId} className="cowork-radar-story__headline">{text.headline}</h2>
                  <p className="cowork-radar-story__summary">{text.summary}</p>
                  <p className="cowork-radar-story__meta">
                    <StorySource story={story} />
                    <span aria-hidden="true">·</span>
                    <time dateTime={story.publishedAt}>
                      {t("cowork.radar_published", { time: formatEditionStamp(story.publishedAt, props.locale) })}
                    </time>
                  </p>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** `/radar/:feed`: a Radar subpage inside the Trending AI shell; an unknown feed goes back to Trending AI. */
export function RadarScreen() {
  const { feed: param } = useParams<{ feed?: string }>();
  const feed = radarFeedFromParam(param);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  // Open each subpage at its top, not at the Trending AI page's scroll position.
  useEffect(() => {
    document.getElementById("rr-shell-main")?.scrollTo({ top: 0 });
  }, [feed]);
  if (!feed) return <Navigate to="/guide" replace />;
  return (
    <CoworkShell current="guide" measure={false} headless>
      <div className="cowork-settings__main cowork-preview--wide">
        <RadarPage feed={feed} locale={locale} />
      </div>
    </CoworkShell>
  );
}
