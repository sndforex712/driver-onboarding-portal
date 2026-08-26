import { Router, type IRouter } from "express";

const router: IRouter = Router();

const DEMO_INTEGRATIONS = [
  {
    id: "franklins-crm",
    name: "Franklins CRM",
    provider: "Franklins",
    status: "demo",
    description: "Connects to the Franklins recruiter CRM to receive Hired events and sync driver records. In production this triggers the onboarding pipeline automatically.",
    configFields: [
      { key: "api_base_url", label: "API Base URL", fieldType: "url", required: true, placeholder: "https://api.franklins.ai/v1" },
      { key: "api_key", label: "API Key", fieldType: "password", required: true, placeholder: "fai_key_..." },
      { key: "webhook_secret", label: "Webhook Secret", fieldType: "password", required: true, placeholder: "whsec_..." },
    ],
    logoUrl: null,
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    provider: "Telegram",
    status: "demo",
    description: "Automatically adds drivers to Telegram onboarding groups and notifies dispatch on readiness. Required for the Telegram onboarding gate.",
    configFields: [
      { key: "bot_token", label: "Bot Token", fieldType: "password", required: true, placeholder: "123456:ABC-..." },
      { key: "onboarding_group_id", label: "Onboarding Group Chat ID", fieldType: "text", required: true, placeholder: "-100..." },
      { key: "dispatch_group_id", label: "Dispatch Group Chat ID", fieldType: "text", required: true, placeholder: "-100..." },
    ],
    logoUrl: null,
  },
  {
    id: "docusign",
    name: "DocuSign",
    provider: "DocuSign",
    status: "demo",
    description: "Sends and tracks e-signature envelopes for lease agreements, offer letters, and consent forms.",
    configFields: [
      { key: "account_id", label: "Account ID", fieldType: "text", required: true, placeholder: "xxxxxxxx-xxxx-..." },
      { key: "integration_key", label: "Integration Key", fieldType: "password", required: true, placeholder: "xxxxxxxx-xxxx-..." },
      { key: "user_id", label: "User ID", fieldType: "text", required: true, placeholder: "xxxxxxxx-xxxx-..." },
      { key: "base_path", label: "Base Path", fieldType: "select", required: true, options: ["https://na4.docusign.net", "https://demo.docusign.net"] },
    ],
    logoUrl: null,
  },
  {
    id: "clearinghouse",
    name: "FMCSA Clearinghouse",
    provider: "Clearinghouse",
    status: "demo",
    description: "Submits consent forms and queries the FMCSA Drug & Alcohol Clearinghouse for pre-employment checks.",
    configFields: [
      { key: "employer_id", label: "Employer ID", fieldType: "text", required: true, placeholder: "EMP-..." },
      { key: "api_key", label: "API Key", fieldType: "password", required: true, placeholder: "chk_..." },
    ],
    logoUrl: null,
  },
  {
    id: "drug-testing",
    name: "Drug Testing Provider",
    provider: "Occuscreen",
    status: "demo",
    description: "Orders and tracks pre-employment DOT drug test results. Integrates with your designated TPA.",
    configFields: [
      { key: "provider", label: "Provider", fieldType: "select", required: true, options: ["Occuscreen", "Concentra", "Quest Diagnostics", "LabCorp"] },
      { key: "account_number", label: "Account Number", fieldType: "text", required: true, placeholder: "ACC-..." },
      { key: "api_key", label: "API Key", fieldType: "password", required: true, placeholder: "dt_key_..." },
    ],
    logoUrl: null,
  },
  {
    id: "ups",
    name: "UPS Shipping",
    provider: "UPS",
    status: "demo",
    description: "Tracks equipment shipment status (ELD devices, fuel cards, company materials) sent to new drivers.",
    configFields: [
      { key: "client_id", label: "Client ID", fieldType: "text", required: true, placeholder: "ups_client_..." },
      { key: "client_secret", label: "Client Secret", fieldType: "password", required: true, placeholder: "ups_secret_..." },
      { key: "shipper_number", label: "Shipper Account Number", fieldType: "text", required: true, placeholder: "XXXXXX" },
    ],
    logoUrl: null,
  },
  {
    id: "datatruck",
    name: "DataTruck TMS",
    provider: "DataTruck",
    status: "demo",
    description: "Syncs approved driver records into the DataTruck Transport Management System. Triggers dispatch handoff and load assignment.",
    configFields: [
      { key: "api_base_url", label: "API Base URL", fieldType: "url", required: true, placeholder: "https://api.datatruck.com/v2" },
      { key: "carrier_id", label: "Carrier ID", fieldType: "text", required: true, placeholder: "carrier_..." },
      { key: "api_key", label: "API Key", fieldType: "password", required: true, placeholder: "dtk_..." },
      { key: "environment", label: "Environment", fieldType: "select", required: true, options: ["sandbox", "production"] },
    ],
    logoUrl: null,
  },
];

router.get("/integrations", async (_req, res): Promise<void> => {
  res.json(DEMO_INTEGRATIONS);
});

export default router;
