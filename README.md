# DigitalTicket

Plataforma SaaS multi-tenant e white-label para venda de ingressos, gestão de eventos e controle de entrada. O produto combina portal público do organizador, painel operacional, checkout com PIX/cartão, emissão de voucher e check-in por QR Code.

## Estado atual

A fundação do projeto está pronta para evolução incremental. O repositório já possui estrutura pnpm workspace, PostgreSQL local, schema Prisma com os domínios principais, contratos compartilhados, base do servidor API, helpers de JWT/refresh, contratos de integração e uma experiência web inicial em tema escuro moderno. O runtime web executável continua sendo o scaffold fullstack gerenciado, enquanto `apps/api` concentra a separação alvo do backend Node/Express/Prisma/PostgreSQL.

| Camada | Local | Situação |
|---|---|---|
| Web | `client/` e `apps/web/` | Dashboard inicial, login OAuth do scaffold e tema escuro |
| API | `server/` e `apps/api/` | Base Express, schema Prisma, auth primitives e regras de domínio |
| Mobile | `apps/mobile/` | Tela Expo preparada para fluxo de check-in |
| Compartilhado | `packages/shared/` e `packages/ui/` | Tipos, estados, tema e contratos de UI |
| Banco | `apps/api/prisma/schema.prisma` | PostgreSQL modelado para multi-tenancy e transações |

## Desenvolvimento local

O ambiente gerenciado do projeto executa o frontend e o servidor fullstack principal. Para a arquitetura alvo, inicie o PostgreSQL com:

```bash
docker compose up -d postgres
pnpm install
pnpm check
pnpm test
```

A API separada pode ser executada com `pnpm --filter @digitalticket/api dev` depois que o cliente Prisma for gerado e as variáveis locais forem configuradas.

## Variáveis de ambiente

Nunca commite valores reais. Para a API separada, use um arquivo `.env` local fora do controle de versão:

```env
DATABASE_URL=postgresql://digitalticket:digitalticket_dev@localhost:5432/digitalticket
JWT_SECRET=troque-por-um-segredo-longo
MERCADO_PAGO_ACCESS_TOKEN=seu-token-de-sandbox
MERCADO_PAGO_WEBHOOK_SECRET=segredo-do-webhook
MAIL_FROM=no-reply@seudominio.com
PORT=4000
```

As credenciais do Mercado Pago e do provedor de e-mail devem permanecer no servidor. O checkout precisa usar credenciais de sandbox até que o fluxo de webhook, idempotência e reconciliação esteja validado.

## Decisões importantes

O isolamento de dados é feito por `organizationId`; nenhum endpoint de organizador deve aceitar um identificador de tenant confiado apenas do cliente. O backend deve derivar a organização a partir da sessão, validar o papel e aplicar o filtro nas consultas. A capacidade do lote deve ser atualizada em transação, e a aprovação de pagamento deve ser idempotente antes da emissão de ingressos.

O tema padrão do painel usa fundo azul-marinho profundo, superfícies elevadas, acentos fúcsia/violeta e tipografia Space Grotesk + DM Sans. A área pública poderá substituir esses tokens por organização, logo e domínio próprios.

## Referências de produto

A análise funcional que orienta o projeto está em `analise_doticket.md` e distingue evidência observada, declaração comercial, inferência arquitetural e pontos que ainda precisam de validação. O DigitalTicket usa essa análise como referência de fluxos, sem copiar credenciais, dados privados ou conteúdo proprietário.

