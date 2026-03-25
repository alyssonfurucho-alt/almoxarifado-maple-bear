-- ============================================================
-- ALMOXARIFADO ESCOLAR — Schema do banco de dados (Supabase)
-- Cole este SQL no editor do Supabase: SQL Editor > New query
-- ============================================================

-- 1. Tabela de usuários (perfis vinculados ao Auth do Supabase)
create table public.usuarios (
  id uuid default gen_random_uuid() primary key,
  auth_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  perfil text not null default 'Professor(a)',  -- 'Administrador', 'Professor(a)', 'Auxiliar'
  sala text default '-',
  turno text default 'Manhã',
  ativo boolean default true,
  created_at timestamptz default now()
);

-- 2. Tabela de itens do almoxarifado
create table public.itens (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  categoria text not null default 'Material escolar',
  custo_unitario numeric(10,2) not null default 0,
  quantidade integer not null default 0,
  unidade text not null default 'un',
  created_at timestamptz default now()
);

-- 3. Tabela de saídas
create table public.saidas (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references public.itens(id),
  quantidade integer not null,
  devolvido integer not null default 0,
  professor text not null,
  sala text not null,
  turno text not null,
  data_saida date not null,
  devolvivel boolean not null default false,
  data_devolucao_prevista date,
  observacoes text,
  created_at timestamptz default now()
);

-- 4. Tabela de devoluções
create table public.devolucoes (
  id uuid default gen_random_uuid() primary key,
  saida_id uuid references public.saidas(id),
  quantidade integer not null,
  data_devolucao date not null,
  avaria boolean not null default false,
  avaria_descricao text,
  avaria_quantidade integer default 0,
  observacoes text,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security (RLS) — Segurança por linha
-- ============================================================

alter table public.usuarios enable row level security;
alter table public.itens enable row level security;
alter table public.saidas enable row level security;
alter table public.devolucoes enable row level security;

-- Usuários autenticados podem ler e escrever em todas as tabelas
create policy "Acesso autenticado - usuarios"
  on public.usuarios for all
  to authenticated
  using (true)
  with check (true);

create policy "Acesso autenticado - itens"
  on public.itens for all
  to authenticated
  using (true)
  with check (true);

create policy "Acesso autenticado - saidas"
  on public.saidas for all
  to authenticated
  using (true)
  with check (true);

create policy "Acesso autenticado - devolucoes"
  on public.devolucoes for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- Dados iniciais de exemplo (opcional — pode apagar depois)
-- ============================================================

insert into public.itens (nome, categoria, custo_unitario, quantidade, unidade) values
  ('Pincel atômico', 'Material escolar', 3.50, 40, 'un'),
  ('Papel A4 (resma)', 'Escritório', 28.90, 15, 'resma'),
  ('Tesoura', 'Material escolar', 12.00, 20, 'un'),
  ('Cola bastão', 'Material escolar', 4.50, 30, 'un'),
  ('Régua 30cm', 'Material escolar', 2.80, 25, 'un'),
  ('Detergente', 'Limpeza', 3.20, 12, 'un');
