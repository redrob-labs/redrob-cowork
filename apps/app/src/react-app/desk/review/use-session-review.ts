import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RedrobReviewAnchor, RedrobReviewStatus, RedrobSessionReview } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import { PROFILE_QUERY_KEY } from "../settings/profile-group";
import { useDeskConnection, type DeskReviewClient } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";

export const REVIEW_QUERY_KEY = "desk-review";

/** A live room pushes changes (L2); until then a shared session is re-read on this beat. */
const REVIEW_REFETCH_MS = 15_000;

export function reviewQueryKey(workspaceId: string | null, sessionId: string | null): readonly unknown[] {
  return ["desk", REVIEW_QUERY_KEY, workspaceId ?? "", sessionId ?? ""];
}

export type SessionReviewApi = {
  review: RedrobSessionReview | undefined;
  /** This install's participant id, for "your comment". */
  me: string | null;
  busy: boolean;
  add(anchor: RedrobReviewAnchor, text: string): Promise<boolean>;
  resolve(commentId: string, resolved: boolean): void;
  remove(commentId: string): void;
  setStatus(status: RedrobReviewStatus, note?: string): void;
};

/**
 * The review of one session, from the local server, with the changes the thread can make.
 * Null outside a connected chat: there is nothing to comment on in a preview.
 */
export function useSessionReview(sessionId: string | null | undefined): SessionReviewApi | null {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const live = client && workspaceId && sessionId ? { client: client as DeskReviewClient, workspaceId, sessionId } : null;
  const key = reviewQueryKey(workspaceId, sessionId ?? null);
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);

  const review = useQuery({
    queryKey: key,
    enabled: Boolean(live),
    queryFn: () => (live ? live.client.getSessionReview(live.workspaceId, live.sessionId) : Promise.resolve(undefined)),
    refetchInterval: REVIEW_REFETCH_MS,
    staleTime: 5_000,
  });
  const profile = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    enabled: Boolean(client),
    queryFn: () => (client ? client.getProfile() : Promise.resolve(null)),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (run: (target: NonNullable<typeof live>) => Promise<RedrobSessionReview>) => {
      if (!live) return Promise.reject(new Error("not connected"));
      return run(live);
    },
    onSuccess: (next) => queryClient.setQueryData(key, next),
    onError: () => showToast(t("desk.review_failed"), t("desk.settings_try_again"), "danger"),
  });

  if (!live) return null;
  const run = (change: (target: NonNullable<typeof live>) => Promise<RedrobSessionReview>) =>
    mutation.mutateAsync(change).then(
      () => true,
      () => false,
    );

  return {
    review: review.data,
    me: profile.data?.participantId ?? null,
    busy: mutation.isPending,
    add: (anchor, text) => run((target) => target.client.addReviewComment(target.workspaceId, target.sessionId, { anchor, text })),
    resolve: (commentId, resolved) =>
      void run((target) => target.client.resolveReviewComment(target.workspaceId, target.sessionId, commentId, resolved)),
    remove: (commentId) => void run((target) => target.client.deleteReviewComment(target.workspaceId, target.sessionId, commentId)),
    setStatus: (status, note) =>
      void run((target) =>
        target.client.setReviewState(target.workspaceId, target.sessionId, { status, ...(note?.trim() ? { note: note.trim() } : {}) }),
      ),
  };
}
