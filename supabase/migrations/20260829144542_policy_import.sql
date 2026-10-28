-- 1. Enforce policy_number uniqueness
alter table policies
  add constraint policies_policy_number_key unique (policy_number);

-- 2. Atomic batch-import RPC
create or replace function import_policies_batch(p_policies jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  policy_item jsonb;
  schedule_item jsonb;
  new_policy_id uuid;
  new_client_id uuid;
  existing_client_id uuid;
  results jsonb := '[]'::jsonb;
begin
  for policy_item in select * from jsonb_array_elements(p_policies)
  loop
    begin
      select id into existing_client_id
      from clients
      where id_number = policy_item->>'client_id_number';

      if existing_client_id is null then
        insert into clients (full_name, id_number, mobile, address)
        values (
          policy_item->>'client_full_name',
          policy_item->>'client_id_number',
          nullif(policy_item->>'client_mobile', ''),
          nullif(policy_item->>'client_address', '')
        )
        returning id into new_client_id;
      else
        new_client_id := existing_client_id;
      end if;

      insert into policies (
        client_id, policy_number, policy_type,
        start_date, end_date, total_price,
        initial_payment_required, installment_count,
        first_installment_offset_days, installment_interval_days
      )
      values (
        new_client_id,
        policy_item->>'policy_number',
        policy_item->>'policy_type',
        (policy_item->>'start_date')::date,
        (policy_item->>'end_date')::date,
        (policy_item->>'total_price')::numeric,
        0,
        jsonb_array_length(policy_item->'schedule'),
        null,
        null
      )
      returning id into new_policy_id;

      for schedule_item in select * from jsonb_array_elements(policy_item->'schedule')
      loop
        insert into payment_schedule (
          policy_id, sequence_number, description, amount_due, due_date
        )
        values (
          new_policy_id,
          (schedule_item->>'sequence_number')::int,
          schedule_item->>'description',
          (schedule_item->>'amount_due')::numeric,
          (schedule_item->>'due_date')::date
        );
      end loop;

      results := results || jsonb_build_object(
        'policy_number', policy_item->>'policy_number',
        'status', 'imported'
      );

    exception
      when unique_violation then
        results := results || jsonb_build_object(
          'policy_number', policy_item->>'policy_number',
          'status', 'skipped',
          'reason', 'duplicate_policy_number'
        );
      when others then
        results := results || jsonb_build_object(
          'policy_number', policy_item->>'policy_number',
          'status', 'failed',
          'reason', SQLERRM
        );
    end;
  end loop;

  return results;
end;
$$;

-- 3. Restrict execution to authenticated users only (matches existing RPC pattern in this project)
revoke all on function import_policies_batch(jsonb) from public;
grant execute on function import_policies_batch(jsonb) to authenticated;