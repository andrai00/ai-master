"use client";

import { useQuery } from "@tanstack/react-query";

export interface IChatHistoryResult<T> {
  messages: T[];
  total: number;
  page: number;
  pageSize: number;
}

type TFetchPage<T> = (
  sessionId: string,
  page: number,
  pageSize: number
) => Promise<IChatHistoryResult<T> | { error: string }>;

/**
 * Paginated history for a chat modal. Data is cached per (key, sessionId,
 * page, pageSize) so reopening the modal or going back to a page doesn't
 * re-fetch from the server.
 */
export function useChatHistory<T>(
  key: string,
  sessionId: string | undefined,
  page: number,
  pageSize: number,
  enabled: boolean,
  fetchPage: TFetchPage<T>
) {
  return useQuery({
    queryKey: ["history", key, sessionId, page, pageSize],
    queryFn: () => fetchPage(sessionId!, page, pageSize),
    enabled: enabled && !!sessionId,
  });
}
