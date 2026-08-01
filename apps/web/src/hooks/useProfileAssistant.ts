import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useProfileAssistant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post("/engineers/me/ai-enhance")).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["engineer-profile"] }),
  });
}
