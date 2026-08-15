# Testes end-to-end e Mercado Pago sandbox

Este documento descreve como validar o fluxo completo do DigitalTicket — pedido, pagamento, emissão de ingresso e check-in — contra PostgreSQL real e Mercado Pago sandbox.

## Camadas de teste automatizadas

| Camada | Arquivo | O que cobre |
|---|---|---|
| Unitários | `apps/api/src/*.test.ts` | Auth/JWT, tenancy, cupons, taxas, relatórios, assinatura de QR, contratos de integração |
| Gateway Mercado Pago | `apps/api/src/mercadoPagoGateway.test.ts` | Contrato da API v1 com payloads no formato do sandbox (PIX, cartão, erros, reconciliação) |
| E2E com banco real | `apps/api/src/e2e.test.ts` | Ciclo completo: pedido com cupom → reserva transacional → anti-overselling → emissão idempotente de tickets → métricas e exportações |

Execute tudo com:

```bash
docker compose up -d postgres        # ou PostgreSQL local na porta 5432
export DATABASE_URL=postgresql://digitalticket:digitalticket_dev@localhost:5432/digitalticket
pnpm --filter @digitalticket/api exec prisma migrate deploy
pnpm test
```

## Teste manual com Mercado Pago sandbox

1. Crie uma conta de teste no [painel de desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers) e obtenha o **access token de sandbox** (prefixo `TEST-`).
2. Configure as variáveis da API:

```env
MERCADO_PAGO_ACCESS_TOKEN=TEST-...
MERCADO_PAGO_WEBHOOK_SECRET=<secret gerado no painel de webhooks>
MERCADO_PAGO_WEBHOOK_URL=<url pública HTTPS apontando para /api/webhooks/mercado-pago>
```

3. Suba a API (`pnpm --filter @digitalticket/api dev`) e exponha a porta 4000 via túnel (ex.: `ngrok http 4000`) para receber webhooks.
4. Execute o seed (`pnpm --filter @digitalticket/api seed`) para criar organização, evento publicado e lote demo.
5. No checkout (`/event/demo` ou `/t/<slug>`), crie um pedido e pague com PIX sandbox. O QR Code exibido é o `qr_code` real retornado por `POST /v1/payments`.
6. Para cartão, use os [cartões de teste oficiais](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/test/cards) (ex.: `5031 4332 1540 6351`, CVV 123, validade futura) gerando o token via MercadoPago.js no navegador.
7. Acompanhe a reconciliação: o webhook valida `x-signature` (HMAC), deduplica por `(provider, externalId)` e emite os tickets apenas após `status=approved` confirmado via `GET /v1/payments/:id`.

## Verificações de segurança obrigatórias

- Webhook sem assinatura válida retorna `401` quando `MERCADO_PAGO_WEBHOOK_SECRET` está configurado.
- Reenvio do mesmo webhook retorna `200 { duplicate: true }` sem reemitir tickets.
- `issueTicketsForApprovedOrder` é idempotente: executar duas vezes não duplica ingressos.
- Estoque nunca excede a capacidade do lote, mesmo com pedidos concorrentes (guarda transacional `sold <= capacity - quantity`).
