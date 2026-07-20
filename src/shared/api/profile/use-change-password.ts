"use client";

import { useMutation } from "@tanstack/react-query";
import { changePasswordAction } from "@/src/shared/actions/profile/update-profile";

export function useChangePassword() {
  return useMutation({ mutationFn: changePasswordAction });
}
