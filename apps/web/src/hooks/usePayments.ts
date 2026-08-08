import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface WalletBalance {
  user_id: string;
  escrow_held: number;
  total_earned: number;
  total_spent: number;
  total_released: number;
  currency: string;
}

export interface PaymentParty {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export interface PaymentTransaction {
  id: string;
  project_id: string;
  task_id?: string;
  payer_id: string;
  payee_id: string;
  payer?: PaymentParty;
  payee?: PaymentParty;
  amount: number;
  currency: string;
  status: "ESCROWED" | "RELEASED" | "REFUNDED" | "AUTHORIZED";
  provider: string;
  provider_reference: string;
  created_at: string;
  released_at?: string;
}

export function useWallet(enabled = true) {
  return useQuery<WalletBalance>({
    queryKey: ["walletBalance"],
    queryFn: async () => {
      const res = await api.get("/payments/wallet");
      return res.data;
    },
    enabled,
  });
}

export function useTransactions(enabled = true) {
  return useQuery<PaymentTransaction[]>({
    queryKey: ["paymentTransactions"],
    queryFn: async () => {
      const res = await api.get("/payments/transactions");
      return res.data;
    },
    enabled,
  });
}

export function usePayments() {
  const queryClient = useQueryClient();

  const createEscrowMutation = useMutation({
    mutationFn: async (payload: {
      project_id: string;
      task_id?: string;
      payee_id: string;
      amount: number;
      currency?: string;
    }) => {
      const res = await api.post("/payments/escrow", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walletBalance"] });
      queryClient.invalidateQueries({ queryKey: ["paymentTransactions"] });
    },
  });

  const releaseEscrowMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await api.post(`/payments/${paymentId}/release`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walletBalance"] });
      queryClient.invalidateQueries({ queryKey: ["paymentTransactions"] });
    },
  });

  const refundEscrowMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await api.post(`/payments/${paymentId}/refund`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["walletBalance"] });
      queryClient.invalidateQueries({ queryKey: ["paymentTransactions"] });
    },
  });

  return {
    createEscrow: createEscrowMutation,
    releaseEscrow: releaseEscrowMutation,
    refundEscrow: refundEscrowMutation,
  };
}
