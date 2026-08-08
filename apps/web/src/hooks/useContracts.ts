import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface UserPartySummary {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export interface ContractMilestone {
  id: string;
  contract_id: string;
  title: string;
  amount: number;
  status: string;
  due_date?: string;
  created_at: string;
}

export interface Contract {
  id: string;
  project_id?: string;
  client_id: string;
  worker_id: string;
  client?: UserPartySummary;
  worker?: UserPartySummary;
  title: string;
  scope_description: string;
  rate_type: string;
  rate_amount: number;
  currency: string;
  status: "DRAFT" | "OFFERED" | "SIGNED" | "ACTIVE" | "COMPLETED" | "TERMINATED" | "DISPUTED";
  terms?: string;
  client_signed_at?: string;
  worker_signed_at?: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
  milestones: ContractMilestone[];
}

export interface ContractCreatePayload {
  project_id?: string;
  worker_id: string;
  title: string;
  scope_description: string;
  rate_type?: string;
  rate_amount: number;
  currency?: string;
  terms?: string;
  start_date?: string;
  end_date?: string;
  milestones?: { title: string; amount: number; due_date?: string }[];
}

export function useContracts(enabled = true) {
  const queryClient = useQueryClient();

  const contractsQuery = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: async () => {
      const res = await api.get("/contracts/me");
      return res.data;
    },
    enabled,
  });

  const createContractMutation = useMutation({
    mutationFn: async (payload: ContractCreatePayload) => {
      const res = await api.post("/contracts", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  const signContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await api.post(`/contracts/${contractId}/sign`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  const terminateContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await api.post(`/contracts/${contractId}/terminate`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  return {
    ...contractsQuery,
    createContract: createContractMutation,
    signContract: signContractMutation,
    terminateContract: terminateContractMutation,
  };
}

export function useContract(contractId: string, enabled = true) {
  const queryClient = useQueryClient();

  const contractQuery = useQuery<Contract>({
    queryKey: ["contract", contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: enabled && Boolean(contractId),
  });

  const addMilestoneMutation = useMutation({
    mutationFn: async (payload: { title: string; amount: number; due_date?: string }) => {
      const res = await api.post(`/contracts/${contractId}/milestones`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", contractId] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  return {
    ...contractQuery,
    addMilestone: addMilestoneMutation,
  };
}
