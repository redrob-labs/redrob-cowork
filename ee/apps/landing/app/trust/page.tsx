import { LandingTrustOverview } from "../../components/landing-trust";
import { getGithubData } from "../../lib/github";
import { baseOpenGraph } from "../../lib/seo";

export const metadata = {
  title: "Redrob Work — Security & Data Privacy",
  description:
    "How Redrob Work handles data, subprocessors, incident response, and compliance for self-hosted enterprise deployments.",
  alternates: {
    canonical: "/trust"
  },
  openGraph: {
    ...baseOpenGraph,
    url: "https://redrob.io/trust"
  }
};

export default async function TrustPage() {
  const github = await getGithubData();
  const cal = process.env.NEXT_PUBLIC_CAL_URL ?? "";

  return (
    <LandingTrustOverview
      stars={github.stars}
      downloadHref={github.downloads.macos}
      calUrl={cal}
    />
  );
}
