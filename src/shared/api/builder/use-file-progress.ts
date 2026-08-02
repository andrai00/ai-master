"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFileProgressAction, removeUploadedFileAction } from "@/src/shared/actions/builder/file-progress";
import { setFileOffsetAction } from "@/src/shared/actions/builder/set-file-offset";

export function useFileProgress() {
  return useQuery({
    queryKey: ["builder", "file-progress"],
    queryFn: getFileProgressAction,
    staleTime: 0,
  });
}

export function useRemoveUploadedFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => removeUploadedFileAction(fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builder", "file-progress"] });
    },
  });
}

export function useSetFileOffset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, chunkNumber }: { fileId: string; chunkNumber: number }) =>
      setFileOffsetAction(fileId, chunkNumber),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builder", "file-progress"] });
    },
  });
}
