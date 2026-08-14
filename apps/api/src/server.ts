import express from "express";
import { mercadoPagoWebhook } from "./webhooks";
import { registerAuthRoutes } from "./authRoutes";
import { registerEventRoutes } from "./eventRoutes";

const app = express();
app.use(express.json());
app.post("/api/webhooks/mercado-pago", mercadoPagoWebhook);
registerAuthRoutes(app);
registerEventRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ service: "digitalticket-api", status: "ok", version: "0.1.0" });
});

app.get("/api/v1", (_req, res) => {
  res.json({
    name: "DigitalTicket API",
    modules: ["auth", "tenants", "events", "orders", "payments", "tickets", "check-in"],
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[DigitalTicket API] listening on port ${port}`);
});
