# DigitalTicket

Plataforma SaaS multi-tenant e white-label para venda de ingressos, gestão de eventos e controle de entrada. O produto combina portal público do organizador, painel operacional, checkout com PIX/cartão, emissão de voucher e check-in por QR Code.

## Estado atual

A plataforma já cobre o ciclo completo de venda e entrada: autenticação JWT/RBAC, multi-tenancy, CRUD de eventos e lotes, reserva transacional de estoque, checkout Mercado Pago (PIX + cartão) com webhook autenticado e reconciliação, emissão de tickets com QR Code assinado, check-in persistente, painel super-admin, gestão de pedidos/clientes/cupons, relatórios com exportação CSV e white-label por organização. O runtime web executável continua sendo o scaffold fullstack gerenciado (`client/` + `server/`), enquanto `apps/api` concentra o backend Node/Express/Prisma/PostgreSQL.

### Módulos da API (`apps/api`)

| Módulo | Rotas | Descrição |
|---|---|---|
| auth | `/api/v1/auth/*` | Registro, login, refresh rotativo, logout |
| events | `/api/v1/events`, `/api/v1/public/events/*` | CRUD de eventos/lotes com escopo por organização e página pública |
| orders/payments | `/api/v1/orders*` | Pedido com cupom, pagamento PIX/cartão, polling de status |
| check-in | `/api/v1/check-in/*`, `/api/v1/tickets/:id/cancel` | Validação por QR/código com histórico persistente |
| admin | `/api/v1/admin/*` | Super-admin: organizações, organizadores, taxas, métricas consolidadas |
| management | `/api/v1/manage/*` | Pedidos, clientes e cupons do organizador com busca e paginação |
| reports | `/api/v1/reports/*` | Resumo, métricas por evento, exportações CSV (pedidos, clientes, ingressos) |
| branding | `/api/v1/tenant/branding`, `/api/v1/public/tenants/*` | White-label: resolução por slug/domínio, logo e cores persistidas |
| WhatsApp | `/api/v1/manage/orders/:orderId/send-whatsapp` | Reenvio de códigos de ingresso pela WhatsApp Cloud API |

### Telas web (`client/`)

Dashboard do organizador (`/`), login/cadastro (`/login`), listagem de eventos (`/events`), criação/edição de eventos e lotes (`/events/new`, `/events/:id/edit`), pedidos (`/orders`), clientes (`/customers`), cupons (`/coupons`), relatórios (`/reports`), marca white-label (`/branding`), check-in (`/check-in`), painel super-admin (`/admin`), página pública do organizador (`/t/:slug`) e checkout (`/event/demo`).

| Camada | Local | Situação |
|---|---|---|
| Web | `client/` e `apps/web/` | Dashboard inicial, login OAuth do scaffold e tema escuro |
| API | `server/` e `apps/api/` | Base Express, schema Prisma, auth primitives e regras de domínio |
| Mobile | `apps/mobile/` | Check-in Expo com câmera, cache offline, histórico do operador, feedback sonoro/vibração, lista com busca e estatísticas em tempo real |
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

A API separada pode ser executada com `pnpm --filter @digitalticket/api dev` depois que o cliente Prisma for gerado e as variáveis locais forem configuradas. Para popular o banco com super-admin, organização demo, organizador e evento publicado, execute `pnpm --filter @digitalticket/api seed`. Os testes end-to-end com PostgreSQL real e o contrato do gateway Mercado Pago estão documentados em `docs/e2e-testing.md`.

A documentação interativa da API fica em `http://localhost:4000/api/docs`, com o documento JSON em `http://localhost:4000/api/openapi.json` e a especificação versionada em [`docs/openapi.yaml`](docs/openapi.yaml). O workflow CI/CD está salvo em [`docs/ci-github-actions.yml`](docs/ci-github-actions.yml), pronto para ser copiado para `.github/workflows/ci.yml` por um mantenedor com permissão `workflow`. Ele executa instalação reproduzível, geração do Prisma Client, migrations, typecheck, lint, testes, builds web/API e validação estrutural do OpenAPI em cada push ou pull request para `main`.

## Variáveis de ambiente

Nunca commite valores reais. Para a API separada, use um arquivo `.env` local fora do controle de versão:

```env
DATABASE_URL=postgresql://digitalticket:digitalticket_dev@localhost:5432/digitalticket
JWT_SECRET=troque-por-um-segredo-longo
MERCADO_PAGO_ACCESS_TOKEN=seu-token-de-sandbox
MERCADO_PAGO_WEBHOOK_SECRET=segredo-do-webhook
MAIL_FROM=no-reply@seudominio.com
WHATSAPP_ACCESS_TOKEN=token-da-whatsapp-cloud-api
WHATSAPP_PHONE_NUMBER_ID=id-do-numero-whatsapp
PUBLIC_WEB_URL=https://tickets.seudominio.com
EXPO_PUBLIC_API_URL=http://192.168.0.10:4000
EXPO_PUBLIC_OPERATOR_TOKEN=jwt-do-operador
EXPO_PUBLIC_DEVICE_ID=portaria-01
PORT=4000
```

As credenciais do Mercado Pago e do provedor de e-mail devem permanecer no servidor. O checkout precisa usar credenciais de sandbox até que o fluxo de webhook, idempotência e reconciliação esteja validado.

## Decisões importantes

O isolamento de dados é feito por `organizationId`; nenhum endpoint de organizador deve aceitar um identificador de tenant confiado apenas do cliente. O backend deve derivar a organização a partir da sessão, validar o papel e aplicar o filtro nas consultas. A capacidade do lote deve ser atualizada em transação, e a aprovação de pagamento deve ser idempotente antes da emissão de ingressos.

O tema padrão do painel usa fundo azul-marinho profundo, superfícies elevadas, acentos fúcsia/violeta e tipografia Space Grotesk + DM Sans. A área pública poderá substituir esses tokens por organização, logo e domínio próprios.

## Referências de produto

A análise funcional que orienta o projeto está em `analise_doticket.md` e distingue evidência observada, declaração comercial, inferência arquitetural e pontos que ainda precisam de validação. O DigitalTicket usa essa análise como referência de fluxos, sem copiar credenciais, dados privados ou conteúdo proprietário.

