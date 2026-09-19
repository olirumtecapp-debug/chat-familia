# CasaChat da Família - Manual de Implantação e Publicação

Este guia explica como hospedar o **CasaChat** no **GitHub**, na **Vercel** e configurá-lo no seu **domínio próprio**.

---

## 1. Visão Geral da Arquitetura

- **Frontend:** React 19 + Tailwind CSS 4 + Lucide Icons + Wouter.
- **Backend:** Node.js + Express + tRPC 11.
- **Banco de Dados:** MySQL / TiDB / PlanetScale / Neon / Supabase (compatível via Drizzle ORM).
- **Armazenamento de Fotos:** AWS S3 / Cloudflare R2 ou proxy embutido.

---

## 2. Passo a Passo: Enviar para o GitHub

1. Inicialize o repositório git na pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "feat: versão inicial do CasaChat da Família"
   ```

2. Crie um repositório no seu GitHub (exemplo: `casachat-familia`).

3. Vincule a branch remota e envie o código:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/casachat-familia.git
   git branch -M main
   git push -u origin main
   ```

---

## 3. Passo a Passo: Publicar na Vercel

A Vercel suporta aplicações Fullstack com Node.js e Serverless Functions:

1. Acesse **[vercel.com](https://vercel.com)** e faça login com seu GitHub.
2. Clique em **"Add New..."** > **"Project"**.
3. Selecione o repositório `casachat-familia`.
4. Em **Framework Preset**, mantenha `Vite` ou `Other`.
5. Em **Build Command**, use:
   ```bash
   pnpm build
   ```
6. Em **Output Directory**, use:
   ```bash
   dist/public
   ```
7. Configure as **Environment Variables** (Variáveis de Ambiente) na Vercel:
   - `DATABASE_URL`: String de conexão com seu banco MySQL ou TiDB em nuvem (ex: PlanetScale ou Aiven).
   - `JWT_SECRET`: Uma chave secreta longa aleatória para assinar as sessões de login da família.
   - `NODE_ENV`: `production`
8. Clique em **Deploy**.

---

## 4. Passo a Passo: Conectar seu Domínio Próprio

1. No painel do seu projeto na Vercel, acesse a aba **Settings** > **Domains**.
2. Digite o seu domínio (ex: `familia.seusite.com.br` ou `chatdafamilia.com`).
3. A Vercel exibirá as entradas DNS necessárias:
   - Para subdomínios (ex: `chat.meusite.com`): Crie um registro **CNAME** apontando para `cname.vercel-dns.com`.
   - Para domínio raiz (ex: `meusite.com`): Crie um registro **A** apontando para o IP indicado pela Vercel (`76.76.21.21`).
4. Após configurar no seu registrador (Registro.br, Cloudflare, GoDaddy, Hostinger), a Vercel gerará o certificado SSL (HTTPS) automaticamente em poucos minutos.

---

## 5. Como a Família Usa

1. O familiar abre o link no navegador do celular ou computador.
2. Digita seu **Nome** e **Email** (sem senhas difíceis de lembrar).
3. Pronto! Já pode trocar mensagens, fotos, reagir com emojis e criar grupos.
