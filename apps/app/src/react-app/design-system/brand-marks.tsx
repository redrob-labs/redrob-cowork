/** @jsxImportSource react */
import { useId } from "react";

/**
 * Brand marks carried in the app rather than fetched, for the labs the model menu recommends.
 *
 * These four used to come from the Simple Icons CDN, with a favicon as the fallback, so the menu
 * showed a blank square wherever those hosts are blocked, which is the case in many company networks
 * and offline. Simple Icons also has no Grok mark, so a reachable CDN still gave Grok the X logo.
 *
 * The paths are from Lobe Icons (`@lobehub/icons-static-svg` 1.95.1, MIT; see REUSE.toml), copied as
 * published rather than redrawn. Gemini, Meta and Qwen are the brand-colour versions. Grok publishes
 * only a single-colour mark, so it uses `currentColor` and follows the text colour in dark mode, as the
 * inline Anthropic and OpenAI marks do.
 *
 * Gradient ids come from `useId`, because a page renders many of these at once and `url(#id)` resolves
 * to the first element with that id in the document.
 */

export type BrandMark = "gemini" | "meta" | "qwen" | "grok";

/** The mark for a vendor or provider id (`google`, `meta-llama`, `x-ai`, `qwen`...), or null. */
export function brandMarkFor(id: string): BrandMark | null {
  switch (id) {
    case "google":
    case "gemini":
    case "google-generative-ai":
      return "gemini";
    case "meta":
    case "meta-llama":
    case "llama":
      return "meta";
    case "qwen":
    case "alibaba":
      return "qwen";
    case "xai":
    case "x-ai":
      return "grok";
    default:
      return null;
  }
}

function useGradientId(name: string): (index?: number) => string {
  const base = `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (index = 0) => `${base}-${index}`;
}

const GEMINI_PATH =
  "M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z";

function Gemini(props: { size: number }) {
  const id = useGradientId("gemini");
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size}>
      <path d={GEMINI_PATH} fill="#3186FF" />
      <path d={GEMINI_PATH} fill={`url(#${id(0)})`} />
      <path d={GEMINI_PATH} fill={`url(#${id(1)})`} />
      <path d={GEMINI_PATH} fill={`url(#${id(2)})`} />
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={id(0)} x1="7" x2="11" y1="15.5" y2="12">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id={id(1)} x1="8" x2="11.5" y1="5.5" y2="11">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id={id(2)} x1="3.5" x2="17.5" y1="13.5" y2="12">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Meta's infinity mark: thirteen segments, each with its own two-stop blue gradient, as published. */
const META_SEGMENTS: ReadonlyArray<{ d: string; fill: string | number }> = [
  { d: "M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z", fill: 0 },
  { d: "M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z", fill: 1 },
  { d: "M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z", fill: 2 },
  { d: "M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z", fill: 3 },
  { d: "M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z", fill: 4 },
  { d: "M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z", fill: 5 },
  { d: "M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z", fill: "#0082FB" },
  { d: "M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z", fill: 6 },
  { d: "M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z", fill: "#0082FB" },
  { d: "M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z", fill: 7 },
  { d: "M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z", fill: 8 },
  { d: "M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z", fill: 9 },
  { d: "M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z", fill: 10 },
  { d: "M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z", fill: 11 },
  { d: "M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z", fill: 12 },
];

/** [x1, x2, y1, y2, [offset, colour][]] per gradient, in percent, as published. */
const META_GRADIENTS: ReadonlyArray<[string, string, string, string, ReadonlyArray<[string, string]>]> = [
  ["75.897%", "26.312%", "89.199%", "12.194%", [[".06%", "#0867DF"], ["45.39%", "#0668E1"], ["85.91%", "#0064E0"]]],
  ["21.67%", "97.068%", "75.874%", "23.985%", [["13.23%", "#0064DF"], ["99.88%", "#0064E0"]]],
  ["38.263%", "60.895%", "89.127%", "16.131%", [["1.47%", "#0072EC"], ["68.81%", "#0064DF"]]],
  ["47.032%", "52.15%", "90.19%", "15.745%", [["7.31%", "#007CF6"], ["99.43%", "#0072EC"]]],
  ["52.155%", "47.591%", "58.301%", "37.004%", [["7.31%", "#007FF9"], ["100%", "#007CF6"]]],
  ["37.689%", "61.961%", "12.502%", "63.624%", [["7.31%", "#007FF9"], ["100%", "#0082FB"]]],
  ["34.808%", "62.313%", "68.859%", "23.174%", [["27.99%", "#007FF8"], ["91.41%", "#0082FB"]]],
  ["43.762%", "57.602%", "6.235%", "98.514%", [["0%", "#0082FB"], ["99.95%", "#0081FA"]]],
  ["60.055%", "39.88%", "4.661%", "69.077%", [["6.19%", "#0081FA"], ["100%", "#0080F9"]]],
  ["30.282%", "61.081%", "59.32%", "33.244%", [["0%", "#027AF3"], ["100%", "#0080F9"]]],
  ["20.433%", "82.112%", "50.001%", "50.001%", [["0%", "#0377EF"], ["99.94%", "#0279F1"]]],
  ["40.303%", "72.394%", "35.298%", "57.811%", [[".19%", "#0471E9"], ["100%", "#0377EF"]]],
  ["32.254%", "68.003%", "19.719%", "84.908%", [["27.65%", "#0867DF"], ["100%", "#0471E9"]]],
];

function Meta(props: { size: number }) {
  const id = useGradientId("meta");
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size}>
      {META_SEGMENTS.map((segment, i) => (
        <path key={i} d={segment.d} fill={typeof segment.fill === "number" ? `url(#${id(segment.fill)})` : segment.fill} />
      ))}
      <defs>
        {META_GRADIENTS.map(([x1, x2, y1, y2, stops], i) => (
          <linearGradient key={i} id={id(i)} x1={x1} x2={x2} y1={y1} y2={y2}>
            {stops.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

function Qwen(props: { size: number }) {
  const id = useGradientId("qwen");
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size}>
      <path
        d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"
        fill={`url(#${id()})`}
        fillRule="nonzero"
      />
      <defs>
        <linearGradient id={id()} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#6336E7" stopOpacity=".84" />
          <stop offset="100%" stopColor="#6F69F7" stopOpacity=".84" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Grok(props: { size: number }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" fillRule="evenodd" width={props.size} height={props.size}>
      <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815" />
    </svg>
  );
}

export function BrandMarkIcon(props: { mark: BrandMark; size: number }) {
  if (props.mark === "gemini") return <Gemini size={props.size} />;
  if (props.mark === "meta") return <Meta size={props.size} />;
  if (props.mark === "qwen") return <Qwen size={props.size} />;
  return <Grok size={props.size} />;
}
