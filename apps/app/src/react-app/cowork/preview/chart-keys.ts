/**
 * Static locale keys for the Trending AI chart tiles.
 *
 * The i18n audit forbids keys built at runtime (`t(\`cowork.chart_skill_${id}\`)`): a key that only
 * exists as a template is invisible to the unused-key and dangling-key checks, so a renamed or
 * deleted string fails silently in one locale. Every tile id therefore maps to its literal key here,
 * and the maps are typed against the id lists so adding a tile without its key is a compile error.
 */

export const SKILL_IDS = [
  "seeking-information",
  "writing",
  "practical-howto",
  "summarizing",
  "editing",
  "research",
  "brainstorming",
  "coding",
  "image-generation",
  "data-analysis",
  "translation",
  "email",
  "planning",
  "tutoring",
  "meeting-notes",
  "transcription",
  "knowledge-qa",
  "social-content",
  "document-processing",
  "code-review",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const SKILL_LABEL_KEY: Record<SkillId, string> = {
  "seeking-information": "cowork.chart_skill_seeking-information",
  writing: "cowork.chart_skill_writing",
  "practical-howto": "cowork.chart_skill_practical-howto",
  summarizing: "cowork.chart_skill_summarizing",
  editing: "cowork.chart_skill_editing",
  research: "cowork.chart_skill_research",
  brainstorming: "cowork.chart_skill_brainstorming",
  coding: "cowork.chart_skill_coding",
  "image-generation": "cowork.chart_skill_image-generation",
  "data-analysis": "cowork.chart_skill_data-analysis",
  translation: "cowork.chart_skill_translation",
  email: "cowork.chart_skill_email",
  planning: "cowork.chart_skill_planning",
  tutoring: "cowork.chart_skill_tutoring",
  "meeting-notes": "cowork.chart_skill_meeting-notes",
  transcription: "cowork.chart_skill_transcription",
  "knowledge-qa": "cowork.chart_skill_knowledge-qa",
  "social-content": "cowork.chart_skill_social-content",
  "document-processing": "cowork.chart_skill_document-processing",
  "code-review": "cowork.chart_skill_code-review",
};

export const COUNTRY_IDS = [
  "us",
  "china",
  "france",
  "korea",
  "japan",
  "germany",
  "uk",
  "canada",
  "israel",
  "india",
  "uae",
  "saudi",
] as const;
export type CountryId = (typeof COUNTRY_IDS)[number];

export const COUNTRY_LABEL_KEY: Record<CountryId, string> = {
  us: "cowork.chart_country_us",
  china: "cowork.chart_country_china",
  france: "cowork.chart_country_france",
  korea: "cowork.chart_country_korea",
  japan: "cowork.chart_country_japan",
  germany: "cowork.chart_country_germany",
  uk: "cowork.chart_country_uk",
  canada: "cowork.chart_country_canada",
  israel: "cowork.chart_country_israel",
  india: "cowork.chart_country_india",
  uae: "cowork.chart_country_uae",
  saudi: "cowork.chart_country_saudi",
};

export const FEATURE_IDS = ["writing", "coding", "image"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export const FEATURE_KEYS: Record<FeatureId, { title: string; sub: string }> = {
  writing: { title: "cowork.chart_feature_writing_title", sub: "cowork.chart_feature_writing_sub" },
  coding: { title: "cowork.chart_feature_coding_title", sub: "cowork.chart_feature_coding_sub" },
  image: { title: "cowork.chart_feature_image_title", sub: "cowork.chart_feature_image_sub" },
};

export const CHART_OUTPUT_ORDER = [
  "code",
  "documents",
  "chatbots",
  "graphics",
  "voice",
  "data",
  "web",
  "spreadsheets",
  "audio",
  "video",
  "diagrams",
  "presentations",
] as const;
export type ChartOutput = (typeof CHART_OUTPUT_ORDER)[number];

export const OUTPUT_LABEL_KEY: Record<ChartOutput, string> = {
  code: "cowork.guide_output_code",
  documents: "cowork.guide_output_documents",
  chatbots: "cowork.guide_output_chatbots",
  graphics: "cowork.guide_output_graphics",
  voice: "cowork.guide_output_voice",
  data: "cowork.guide_output_data",
  web: "cowork.guide_output_web",
  spreadsheets: "cowork.guide_output_spreadsheets",
  audio: "cowork.guide_output_audio",
  video: "cowork.guide_output_video",
  diagrams: "cowork.guide_output_diagrams",
  presentations: "cowork.guide_output_presentations",
};
