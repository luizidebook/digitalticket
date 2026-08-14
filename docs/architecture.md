# DigitalTicket — Arquitetura inicial

O DigitalTicket é uma plataforma SaaS de ticketeria com isolamento por organização. A primeira entrega preserva o scaffold fullstack gerenciado, que fornece o processo Node/Express, React/Vite, tRPC, autenticação de sessão e camada de banco. Ao redor dele, o repositório passa a ter uma estrutura de monorepo pnpm preparada para separar a API, o web app, o aplicativo Expo e os pacotes compartilhados.

## Domínios principais

| Domínio | Responsabilidade | Regra crítica |
|---|---|---|
| Organização | Marca, tema, slug e domínio do organizador | Toda leitura e escrita de negócio deve carregar `tenantId` |
| Identidade | Super-admin, organizador e comprador | RBAC no servidor; a interface não é uma barreira de segurança |
| Evento | Produto público, datas, descrição, mídia e publicação | Apenas eventos publicados aparecem no portal público |
| Lote | Preço, capacidade, janela e limites por pedido | Estoque é atualizado em transação para evitar overselling |
| Pedido | Intenção de compra, itens, desconto e totais | Total é sempre recalculado no backend |
| Pagamento | PIX/cartão, status e referência externa | Webhooks do Mercado Pago precisam ser idempotentes |
| Ticket | Unidade emitida, QR token e código alternativo | Um ingresso é emitido por unidade confirmada |
| Check-in | Validação e histórico de entrada | Segunda validação é rejeitada, salvo regra explícita de reentrada |

## Fluxo prioritário

O organizador cria o evento, configura datas e lotes e publica a página white-label. O comprador escolhe a data, o lote e a quantidade, informa seus dados, aceita os termos e cria um pedido. O Mercado Pago confirma PIX ou cartão por retorno/webhook idempotente. Somente após a confirmação o sistema emite ingressos individuais, gera os QR Codes e envia o voucher. Na entrada, o operador valida o QR Code ou o código alfanumérico; o resultado alimenta o dashboard e o histórico de check-in.

## Separação de responsabilidades

A integração Mercado Pago será encapsulada em um adaptador de gateway. O serviço de pedidos não deve conhecer detalhes de HTTP do provedor. O serviço de emissão de tickets deve ser acionado por uma transição de pagamento aprovada e protegida por uma chave idempotente. O serviço de e-mail terá uma interface própria para permitir troca de provedor sem alterar o domínio.

## Tema e white-label

O painel operacional usa tema escuro moderno, com superfícies em azul-marinho, bordas discretas e acentos coral/roxo. A área pública usa tokens CSS derivados das configurações do tenant, permitindo logo, cor primária, cor de destaque e domínio configuráveis. O tema padrão é apenas um fallback; o organizador deve poder sobrescrevê-lo.

## Escopo desta fundação

A etapa inicial entrega a estrutura de monorepo, documentação, PostgreSQL local, contratos compartilhados, base de dados multi-tenant e a experiência web principal. A integração com Mercado Pago e o app Expo ficam preparados por adaptadores e contratos, mas credenciais reais, envio financeiro de produção e publicação mobile dependem de configuração posterior do ambiente.

