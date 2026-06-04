-- ═══════════════════════════════════════════════
-- POINTLY — Schéma base de données Supabase
-- Coller dans : Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════

-- ── EXTENSIONS ──
create extension if not exists "uuid-ossp";

-- ── COMPANIES ──
create table public.companies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  sector      text,
  pause_mode  text default 'managed', -- 'managed' | 'fixed'
  brand_color text default '#1A1A2E',
  created_at  timestamptz default now()
);

-- ── PROFILES (extension de auth.users) ──
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,
  full_name   text not null,
  role        text not null default 'employee', -- 'admin' | 'employee'
  poste       text,
  contract    text default 'fixe',   -- 'fixe' | 'heure'
  h_due       numeric default 169,
  vac_droit   integer default 20,
  vac_pris    integer default 0,
  cycle       text default '1-1',    -- '1-1' | '25-25' | '15-15' etc.
  color_bg    text default '#E6F1FB',
  color_fg    text default '#185FA5',
  created_at  timestamptz default now()
);

-- ── SHIFTS (planning) ──
create table public.shifts (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references public.companies(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  shift_date  date not null,
  poste       text,
  start_time  time not null,
  note        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

-- ── TIME LOGS (pointages) ──
create table public.time_logs (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references public.companies(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete cascade,
  log_date      date not null,
  punched_in    timestamptz,
  pause_start   timestamptz,
  pause_end     timestamptz,
  punched_out   timestamptz,
  net_hours     numeric,
  is_modified   boolean default false,
  modified_by   uuid references public.profiles(id),
  remark        text,
  error_24h     boolean default false,
  created_at    timestamptz default now(),
  unique(user_id, log_date)
);

-- ── DISPOS ──
create table public.dispos (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) on delete cascade,
  dispo_date  date not null,
  status      text not null default 'g', -- 'g' | 'o' | 'r'
  remark      text,
  unique(user_id, dispo_date)
);

-- ── DAY NOTES ──
create table public.day_notes (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references public.companies(id) on delete cascade,
  note_date   date not null,
  content     text,
  color       text default 'normal', -- 'normal' | 'red'
  created_by  uuid references public.profiles(id),
  unique(company_id, note_date)
);

-- ── CHAT MESSAGES ──
create table public.chat_messages (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid references public.companies(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  channel     text not null default 'general', -- 'general' | 'kitchen' | 'private'
  content     text not null,
  created_at  timestamptz default now()
);

-- ── EXCHANGES (échanges horaires) ──
create table public.exchanges (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid references public.companies(id) on delete cascade,
  requester_id    uuid references public.profiles(id) on delete cascade,
  target_id       uuid references public.profiles(id) on delete cascade,
  requester_date  date not null,
  target_date     date not null,
  message         text,
  status          text default 'pending', -- 'pending' | 'accepted' | 'refused'
  admin_approved  boolean default false,
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════

alter table public.companies      enable row level security;
alter table public.profiles       enable row level security;
alter table public.shifts         enable row level security;
alter table public.time_logs      enable row level security;
alter table public.dispos         enable row level security;
alter table public.day_notes      enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.exchanges      enable row level security;

-- Helper : récupérer company_id de l'utilisateur connecté
create or replace function public.my_company_id()
returns uuid language sql stable as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- Helper : rôle de l'utilisateur connecté
create or replace function public.my_role()
returns text language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ── POLICIES : profiles ──
create policy "Voir les profils de sa société"
  on public.profiles for select
  using (company_id = public.my_company_id());

create policy "Modifier son propre profil"
  on public.profiles for update
  using (id = auth.uid());

create policy "Admin modifie tout profil de sa société"
  on public.profiles for update
  using (company_id = public.my_company_id() and public.my_role() = 'admin');

create policy "Insérer son propre profil"
  on public.profiles for insert
  with check (id = auth.uid());

-- ── POLICIES : companies ──
create policy "Voir sa société"
  on public.companies for select
  using (id = public.my_company_id());

create policy "Admin modifie sa société"
  on public.companies for update
  using (id = public.my_company_id() and public.my_role() = 'admin');

create policy "Insérer société à la création"
  on public.companies for insert
  with check (true);

-- ── POLICIES : shifts ──
create policy "Voir les shifts de sa société"
  on public.shifts for select
  using (company_id = public.my_company_id());

create policy "Admin gère les shifts"
  on public.shifts for all
  using (company_id = public.my_company_id() and public.my_role() = 'admin');

-- ── POLICIES : time_logs ──
create policy "Voir ses propres logs"
  on public.time_logs for select
  using (user_id = auth.uid() or company_id = public.my_company_id());

create policy "Insérer son propre log"
  on public.time_logs for insert
  with check (user_id = auth.uid() and company_id = public.my_company_id());

create policy "Modifier son log ou admin"
  on public.time_logs for update
  using (user_id = auth.uid() or (company_id = public.my_company_id() and public.my_role() = 'admin'));

-- ── POLICIES : dispos ──
create policy "Voir les dispos de sa société"
  on public.dispos for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.profiles p
      where p.id = public.dispos.user_id
        and p.company_id = public.my_company_id()
    )
  );

create policy "Gérer ses propres dispos"
  on public.dispos for all
  using (user_id = auth.uid());

-- ── POLICIES : day_notes ──
create policy "Voir les notes de sa société"
  on public.day_notes for select
  using (company_id = public.my_company_id());

create policy "Admin gère les notes"
  on public.day_notes for all
  using (company_id = public.my_company_id() and public.my_role() = 'admin');

-- ── POLICIES : chat ──
create policy "Voir les messages de sa société"
  on public.chat_messages for select
  using (company_id = public.my_company_id());

create policy "Envoyer un message"
  on public.chat_messages for insert
  with check (company_id = public.my_company_id() and user_id = auth.uid());

-- ── POLICIES : exchanges ──
create policy "Voir les échanges de sa société"
  on public.exchanges for select
  using (company_id = public.my_company_id());

create policy "Créer un échange"
  on public.exchanges for insert
  with check (company_id = public.my_company_id() and requester_id = auth.uid());

create policy "Répondre à un échange"
  on public.exchanges for update
  using (target_id = auth.uid() or (company_id = public.my_company_id() and public.my_role() = 'admin'));

-- ═══════════════════════════════════════════════
-- REALTIME (activer pour les tables live)
-- ═══════════════════════════════════════════════
alter publication supabase_realtime add table public.time_logs;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.exchanges;

-- ═══════════════════════════════════════════════
-- FONCTION : calcul heures nettes auto
-- ═══════════════════════════════════════════════
create or replace function public.calc_net_hours()
returns trigger language plpgsql as $$
declare
  brut numeric;
  pause_dur numeric;
begin
  if new.punched_in is not null and new.punched_out is not null then
    brut := extract(epoch from (new.punched_out - new.punched_in)) / 3600.0;
    if new.pause_start is not null and new.pause_end is not null then
      pause_dur := extract(epoch from (new.pause_end - new.pause_start)) / 3600.0;
    else
      pause_dur := 0;
    end if;
    new.net_hours := greatest(0, brut - pause_dur);
  end if;
  return new;
end;
$$;

create trigger trg_calc_net_hours
  before insert or update on public.time_logs
  for each row execute function public.calc_net_hours();
