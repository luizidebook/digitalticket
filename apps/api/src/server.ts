import express from "express";
import swaggerUi from "swagger-ui-express";
import openapiDocument from "./openapi";
import { mercadoPagoWebhook } from "./webhooks";
import { registerAuthRoutes } from "./authRoutes";
import { registerEventRoutes } from "./eventRoutes";
import { registerPaymentRoutes } from "./paymentRoutes";
import { registerCheckinRoutes } from "./checkinRoutes";
import { registerAdminRoutes } from "./adminRoutes";
import { registerManagementRoutes } from "./managementRoutes";
import { registerReportRoutes } from "./reportRoutes";
import { registerTenantRoutes } from "./tenantRoutes";

const app = express();
app.use(express.json());
app.get("/api/openapi.json", (_req, res) => res.json(openapiDocument));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument, { customSiteTitle: "DigitalTicket API Docs", swaggerOptions: { persistAuthorization: true } }));
app.post("/api/webhooks/mercado-pago", mercadoPagoWebhook);
registerAuthRoutes(app);
registerEventRoutes(app);
registerPaymentRoutes(app);
registerCheckinRoutes(app);
registerAdminRoutes(app);
registerManagementRoutes(app);
registerReportRoutes(app);
registerTenantRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ service: "digitalticket-api", status: "ok", version: "0.1.0" });
});

app.get("/api/v1", (_req, res) => {
  res.json({
    name: "DigitalTicket API",
    modules: ["auth", "tenants", "events", "orders", "payments", "tickets", "check-in", "admin", "management", "coupons", "reports", "branding"],
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[DigitalTicket API] listening on port ${port}`);
});
