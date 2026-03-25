# Almoxarifado Escolar

Sistema de controle de almoxarifado para escolas.

---

## Passo a passo para colocar no ar

### Pré-requisitos
- Conta no [Supabase](https://supabase.com) (gratuita)
- Conta no [Vercel](https://vercel.com) (gratuita)
- Conta no [GitHub](https://github.com) (gratuita)
- [Node.js](https://nodejs.org) instalado no computador (versão 18 ou superior)

---

### Etapa 1 — Instalar o Node.js (se ainda não tiver)

1. Acesse https://nodejs.org
2. Clique em "LTS" (versão recomendada) e baixe o instalador para Mac
3. Siga o instalador normalmente
4. Para confirmar: abra o Terminal (CMD+Espaço, digite "Terminal") e rode:
   ```
   node -v
   ```
   Deve aparecer algo como `v20.0.0`

---

### Etapa 2 — Configurar o Supabase (banco de dados)

1. Acesse https://supabase.com e crie uma conta gratuita
2. Clique em **"New project"**
3. Dê um nome: `almoxarifado-escolar`
4. Escolha uma senha segura (guarde-a!) e selecione a região **South America (São Paulo)**
5. Aguarde o projeto criar (1-2 minutos)

**Criar o banco:**
6. No menu lateral, clique em **SQL Editor**
7. Clique em **"New query"**
8. Copie todo o conteúdo do arquivo `schema.sql` e cole no editor
9. Clique em **"Run"** — você verá "Success" em verde

**Pegar as chaves:**
10. No menu lateral, clique em **Settings > API**
11. Copie:
    - **Project URL** (algo como `https://xyzxyz.supabase.co`)
    - **anon public** key (chave longa que começa com `eyJ...`)
mkqurmyleyjqdorsiglf

git push origin main
---

### Etapa 3 — Configurar o projeto localmente

1. Extraia a pasta `almoxarifado-escolar` do zip em um lugar de fácil acesso (ex: Documentos)
2. Abra o Terminal e navegue até a pasta:
   ```
   cd ~/Documents/almoxarifado-escolar
   ```
3. Copie o arquivo de exemplo de variáveis:
   ```
   cp .env.example .env.local
   ```
4. Abra o arquivo `.env.local` com qualquer editor de texto e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
   ```
5. Instale as dependências:
   ```
   npm install
   ```
6. Teste localmente:
   ```
   npm run dev
   ```
   Acesse http://localhost:5173 no navegador. O sistema deve abrir!

---

### Etapa 4 — Criar o primeiro usuário administrador

1. No Supabase, vá em **Authentication > Users**
2. Clique em **"Add user"** > **"Create new user"**
3. Preencha um e-mail e senha
4. Depois vá em **Table Editor > usuarios** e clique em **"Insert row"**
5. Preencha:
   - `auth_id`: cole o ID do usuário que aparece na tela de Auth 3a16d711-bef0-47e3-be45-c64da5ab05be
   - `nome`: seu nome
   - `email`: o e-mail que usou
   - `perfil`: `Administrador`
   - `ativo`: `true`

---

### Etapa 5 — Publicar online com o Vercel

1. Crie uma conta em https://github.com e crie um repositório chamado `almoxarifado-escolar`
2. No Terminal, dentro da pasta do projeto, rode:
   ```
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/alyssonfurucho-alt/almoxarifado-maple-bear.git
   git push -u origin main
   ```
3. Acesse https://vercel.com, crie uma conta e clique em **"New Project"**
4. Importe o repositório `almoxarifado-escolar` do GitHub
5. Antes de clicar em "Deploy", clique em **"Environment Variables"** e adicione:
   - `VITE_SUPABASE_URL` = a URL do seu projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` = a chave anon do Supabase
6. Clique em **"Deploy"**
7. Aguarde 1-2 minutos — o Vercel vai gerar um link como `almoxarifado-escolar.vercel.app`

**Pronto! O sistema está no ar.**

---

## Dúvidas frequentes

**Como adicionar mais usuários depois?**
Na tela de Usuários do sistema (perfil Administrador), clique em "+ Novo usuário".

**O sistema é seguro?**
Sim. Apenas usuários com login podem acessar. Os dados ficam no Supabase com criptografia.

**Posso usar no celular?**
Sim, o sistema funciona em qualquer navegador moderno.

**Como fazer backup dos dados?**
No Supabase, vá em **Settings > Database** e clique em **"Database Backups"**.
