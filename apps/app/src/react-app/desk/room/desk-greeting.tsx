/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useDeskConnection } from "../shell/desk-connection";
import { PROFILE_QUERY_KEY } from "../settings/profile-group";
import { greetingText, msUntilNextSlot, starterHintText } from "./greeting";

/**
 * The Cowork new-chat greeting: a warm, time-aware line that knows the person and
 * rotates through the day (greeting.ts), with a rotating prompt-starter hint as a
 * smaller sub-line beneath it. The old brand beat ("Every border...") was retired.
 *
 * The name comes from the signed-in profile; an unnamed profile falls back to the
 * no-name variant. A timer re-renders the line when the rotation slot changes, so
 * a window left open long enough updates on its own.
 */
export function DeskGreeting() {
  const client = useDeskConnection((state) => state.client);
  const profile = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    enabled: Boolean(client),
    queryFn: () => (client ? client.getProfile() : Promise.resolve(null)),
    staleTime: 60_000,
  });

  // `now` is state so the line refreshes when the rotation slot rolls over.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), msUntilNextSlot(now) + 1_000);
    return () => clearTimeout(timer);
  }, [now]);

  const name = profile.data?.displayName;
  const greeting = greetingText(now, name);
  const hint = starterHintText(now);

  return (
    <div className="desk-new__greeting">
      <h2 className="desk-new__line">{greeting}</h2>
      <p className="desk-new__hint">{hint}</p>
    </div>
  );
}
