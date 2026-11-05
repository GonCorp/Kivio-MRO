# MRO · Minha República em Ordem (Kivio Digital) · Fase 1

App web instalável (PWA) com login, república, convites, escala, missões, multas por faixa,
funções delegadas e painel de super admin. Tudo em ferramentas gratuitas.

## O que tem nesta pasta
- `supabase/01-banco-fase1.sql`: cria todo o banco e as regras de segurança (uma república nunca vê a outra).
- `supabase/02-tornar-admin.sql`: transforma a sua conta em super admin.
- `src/`, `public/`, `index.html`, `package.json`...: o aplicativo.

## Estado atual
- Banco já criado e configurado no Supabase (projeto `kivio-mro`, São Paulo).
- As chaves públicas já estão em `.env.production` (são públicas por natureza; segurança fica nas regras do banco).

## Para publicar (Cloudflare Workers, grátis)
1. Código no GitHub (repositório `Kivio-MRO`).
2. Cloudflare > Workers & Pages > Create > **Import a repository** > escolha o repositório.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Variável de build `NODE_VERSION` = `20`
3. Abra o endereço `...workers.dev`, crie sua conta no app e rode `supabase/02-tornar-admin.sql`
   (trocando o e-mail) no Supabase para virar super admin.

## Regras que o app já aplica
- Escala por pessoa e dia; início (hoje, semana que vem ou data) e repetição (toda semana, uma vez, N vezes).
- Tarefa que ainda não começou não gera falta. Prazo vence sozinho à meia-noite (horário de Brasília).
- Justificativa: o integrante envia, o líder (ou quem tem a função "Escala e multas") aceita ou recusa. Recusada = falta.
- Multa por escada: 1ª falta, 2ª falta... valores da casa; depois da última faixa o valor se repete. Teto mensal opcional.
- Quem não é líder vê só as próprias multas.
- Super admin bloqueia/libera república; república bloqueada não usa nada.
- Plano grátis: até 7 integrantes.
