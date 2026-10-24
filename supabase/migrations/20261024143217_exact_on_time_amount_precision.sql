-- Amount-entry UI converts the requested cash amount to the legacy RPC ratio.
-- numeric(5,2) rounded that ratio and could change a user's exact payable amount.
-- Unconstrained numeric preserves old values, RPC signatures and posted allocations.
alter table public.invoices alter column discount_percent type numeric;
