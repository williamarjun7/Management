import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';

export interface Customer {
  id: string;
  customer_id: string;
  name: string;
  phone: string | null;
  phone_secondary: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  outstanding_balance: number;
  total_credit_taken: number;
  total_amount_paid: number;
  last_visit: string | null;
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  customer_id: string;
  entry_type: 'credit' | 'payment' | 'adjustment' | 'refund';
  amount: number;
  running_balance: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      let query = insforge.database
        .from('customers')
        .select('*')
        .order('name', { ascending: true });
      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,customer_id.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customer', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Customer;
    },
  });
}

export function useCustomerLedger(customerId: string | undefined) {
  return useQuery({
    queryKey: ['customer-ledger', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('customer_ledger_entries')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LedgerEntry[];
    },
  });
}

export function useSearchCustomers() {
  return useMutation({
    mutationFn: async (params: { p_query?: string; p_phone?: string; p_customer_id?: string }) => {
      const { data, error } = await insforge.database.rpc('search_customers', params);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_name: string;
      p_phone?: string;
      p_phone_secondary?: string;
      p_address?: string;
      p_notes?: string;
      p_credit_limit?: number;
    }) => {
      const { data, error } = await insforge.database.rpc('create_customer', params);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useCheckDuplicateCustomer() {
  return useMutation({
    mutationFn: async (params: { p_name: string; p_phone?: string }) => {
      const { data, error } = await insforge.database.rpc('check_duplicate_customer', params);
      if (error) throw error;
      return data as { has_duplicates: boolean; matches: Array<Record<string, unknown>> };
    },
  });
}

export function useRecordCustomerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_customer_id: string;
      p_amount: number;
      p_description?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('make_customer_payment', params);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
    },
  });
}

export function useCustomerCreditSummary() {
  return useQuery({
    queryKey: ['customer-credit-summary'],
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc('get_customer_credit_summary', {});
      if (error) throw error;
      return data as {
        customers: Array<Record<string, unknown>>;
        total_outstanding: number;
        total_credit: number;
        total_paid: number;
        customer_count: number;
      };
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; updates: Partial<Customer> }) => {
      const { error } = await insforge.database
        .from('customers')
        .update(params.updates)
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
