-- 006_chat_messages.sql
-- Creates chat messages table backed by Supabase Realtime

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 1000),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists messages_created_at_idx on public.messages(created_at desc);
create index if not exists messages_user_id_idx on public.messages(user_id);

alter table public.messages enable row level security;

drop policy if exists "Messages readable to whitelisted users" on public.messages;
create policy "Messages readable to whitelisted users"
  on public.messages for select
  using (true);

drop policy if exists "Users can insert their own messages" on public.messages;
create policy "Users can insert their own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages"
  on public.messages for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_message()
returns trigger language plpgsql as $$
begin
  insert into public.events(type, user_id, payload)
  values('chat_message', NEW.user_id, jsonb_build_object('message_id', NEW.id));
  return NEW;
end;
$$;

drop trigger if exists trigger_new_message on public.messages;
create trigger trigger_new_message
  after insert on public.messages
  for each row execute procedure public.handle_new_message();
