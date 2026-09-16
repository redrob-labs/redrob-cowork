/** @jsxImportSource react */
import { useEffect, useState } from "react";

import { providerLogoCandidates } from "./provider-logo-src";

export type ProviderIconProps = {
  providerId?: string | null;
  /**
   * Optional provider display name. When the id is an opaque cloud id
   * (e.g. a uuid), the name is what tells us whether it's an Anthropic /
   * OpenAI / OpenCode provider. Ported from dev 022b68a8 ("key cloud
   * providers by cloud id") so the icon still resolves by family.
   */
  providerName?: string | null;
  /** Configured provider base URL, used as a favicon source for custom providers. */
  baseUrl?: string | null;
  className?: string;
  size?: number;
};

export function ProviderIcon(props: ProviderIconProps) {
  const size = props.size ?? 16;
  const normalizedId = props.providerId?.trim().toLowerCase() ?? "";
  const normalizedName = props.providerName?.trim().toLowerCase() ?? "";
  const hasProviderFamily = (family: string) =>
    normalizedId === family || normalizedName.includes(family);

  const isAnthropic = hasProviderFamily("anthropic");
  const isOpenAI = hasProviderFamily("openai");
  const isOpenCode = hasProviderFamily("opencode");
  const isOpenRouter = hasProviderFamily("openrouter");
  const hasInlineMark = isAnthropic || isOpenAI || isOpenCode || isOpenRouter;

  // Remote logos are walked in order and each failure advances one step, so a
  // provider only falls back to its monogram once every source is exhausted.
  const candidates = hasInlineMark
    ? []
    : providerLogoCandidates({ providerId: props.providerId, baseUrl: props.baseUrl });
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [normalizedId, props.baseUrl]);

  const logoUrl = candidates[candidateIndex];

  const fallbackLetters = (() => {
    if (normalizedId === "openrouter") return "OR";
    if (normalizedId === "deepseek") return "DS";
    if (normalizedId === "google") return "GO";
    if (normalizedId.length >= 2) return normalizedId.substring(0, 2).toUpperCase();
    return "AI";
  })();

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md ${
        props.className ?? ""
      }`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {isOpenAI ? (
        <svg
          role="img"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          width={size}
          height={size}
        >
          <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.49zm-9.66-4.13a4.47 4.47 0 0 1-.53-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.79A4.5 4.5 0 0 1 3.6 18.3zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87zm16.6 3.86-5.83-3.39 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.41-.67zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.79.79 0 0 0-.39.68zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5Z" />
        </svg>
      ) : isAnthropic ? (
        // The Claude burst, copied from claude.ai's own favicon.svg rather than redrawn.
        //
        // The PRODUCT mark, not Anthropic's corporate `A\\` glyph: these rows name models
        // (`claude-opus-5`), and a company mark beside a product name reads as the wrong logo.
        //
        // It is not a symmetric asterisk, and the hand-drawn one that used to be here was exactly
        // that -- eight evenly spaced round-capped spokes. The real mark has TWELVE tapered wedges
        // with blunt tips, deliberately irregular spacing (gaps run 17.8 to 37.9 degrees) and
        // varying tip radii, so any regular star is recognisably not this logo. The official path is
        // pasted verbatim instead of approximated, which is also why the viewBox is 248 and not 24.
        <svg
          role="img"
          viewBox="0 0 248 248"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          width={size}
          height={size}
        >
          <path d="M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z" />
        </svg>
      ) : isOpenRouter ? (
        // The OR glyph from openrouter.ai/brand, their own asset, pasted verbatim.
        //
        // Carried inline rather than fetched: the remote candidates below reach a favicon service,
        // which returns a generic globe with HTTP 200 for anything it cannot resolve, so a wrong icon
        // there never fails loudly enough to fall through.
        //
        // OpenRouter rebranded in July 2026 and the brand page asks that the marks not be stretched or
        // recoloured. The source viewBox is 1024x730, NOT square, so it is padded into a square box
        // here rather than scaled to fit -- stretching it would be the thing they ask us not to do.
        <svg
          role="img"
          viewBox="0 -147 1024 1024"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          width={size}
          height={size}
        >
          <path d="M795.893 0C915.776 0 1012.95 97.9963 1012.95 218.88C1012.95 339.764 915.776 437.76 795.893 437.76L1011.2 654.869C1038.55 682.447 1019.18 729.6 980.504 729.6H361.77C161.97 729.6 0 566.273 0 364.8C0 163.327 161.97 0 361.77 0L795.893 0ZM361.77 145.92C241.89 145.92 144.708 243.916 144.708 364.8C144.708 485.684 241.89 583.68 361.77 583.68C481.649 583.68 578.831 485.684 578.831 364.8C578.831 243.916 481.649 145.92 361.77 145.92Z" />
        </svg>
      ) : isOpenCode ? (
        <svg
          role="img"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          width={size}
          height={size}
        >
          <path d="M12 2L2 7l10 5 10-5-10-5Z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ) : logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          width={size}
          height={size}
          className="object-contain"
          style={{ width: `${size}px`, height: `${size}px` }}
          onError={() => setCandidateIndex((index) => index + 1)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded bg-gray-3 text-[10px] font-bold tracking-tight text-gray-11"
          style={{ fontSize: `${Math.max(8, size * 0.45)}px` }}
        >
          {fallbackLetters}
        </div>
      )}
    </div>
  );
}
