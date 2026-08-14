# Notas Mercado Pago

Fonte consultada: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks

A documentação oficial informa que notificações Webhooks incluem o header `x-signature` com os parâmetros `ts` e `v1`, e que a origem deve ser autenticada por HMAC usando o segredo da aplicação. O código do projeto valida o manifesto `id:{data.id};request-id:{x-request-id};ts:{ts};`, compara `v1` com comparação timing-safe e, após autenticar, consulta o pagamento na API em vez de confiar apenas no payload recebido.

A integração implementada usa a API HTTP `https://api.mercadopago.com`, `POST /v1/payments` para PIX/cartão, `GET /v1/payments/:id` para reconciliação, `X-Idempotency-Key` por pedido, `external_reference` com o ID do pedido e `MERCADO_PAGO_WEBHOOK_URL` para notificações.
