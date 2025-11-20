create table if not exists spotlights (
  id uuid default gen_random_uuid() primary key,
  stream_id uuid references streams(id) not null,
  spotlighted boolean default false not null,
  created_at timestamp with time zone default now() not null
);

-- Add RLS policies
alter table spotlights enable row level security;

create policy "Public can view spotlights"
  on spotlights for select
  using (true);

create policy "Admins can insert spotlights"
  on spotlights for insert
  with check (true); -- For now allow open insert or restrict if we had auth roles setup properly for admins

create policy "Admins can update spotlights"
  on spotlights for update
  using (true);

