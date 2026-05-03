import { getOwnerControls } from "~/services/agent-controls.server";
import { getCustomerSignalSummary } from "~/services/customer-data.server";
import { getJobQueueHealth } from "~/services/job-queue.server";
import { supabase } from "~/utils/supabase.server";

export type BetaReadinessItem = {
  key: string;
  title: string;
  status: "ready" | "needs_setup" | "manual";
  detail: string;
  href?: string;
};

export type BetaReadiness = {
  readyCount: number;
  totalCount: number;
  items: BetaReadinessItem[];
};

export async function getBetaReadiness(storeId: string): Promise<BetaReadiness> {
  const [controls, customerSignals, queueHealth, cogsCount] = await Promise.all([
    getOwnerControls(storeId),
    getCustomerSignalSummary(storeId),
    getJobQueueHealth(storeId),
    countCogsRows(storeId),
  ]);

  const riskyAgentsApprovalFirst =
    controls.agentModes.cart_sniper === "approval" &&
    controls.agentModes.personal_shopper === "approval" &&
    controls.agentModes.retention_engine === "approval";

  const items: BetaReadinessItem[] = [
    {
      key: "store",
      title: "Store connected",
      status: "ready",
      detail: "Shopify install and Supabase store row are connected.",
      href: "/app",
    },
    {
      key: "privacy_webhooks",
      title: "Privacy webhooks",
      status: "ready",
      detail: "Customer data request, customer redact, and shop redact routes are implemented.",
      href: "/privacy",
    },
    {
      key: "legal",
      title: "Privacy, terms, support",
      status: "ready",
      detail: "Public trust pages are available for beta merchants and Shopify review prep.",
      href: "/support",
    },
    {
      key: "safety",
      title: "Safety controls",
      status: riskyAgentsApprovalFirst ? "ready" : "manual",
      detail: riskyAgentsApprovalFirst
        ? "Risky revenue agents start in approval mode."
        : "Review agent modes before customer-facing automation.",
      href: "/app/settings",
    },
    {
      key: "cogs",
      title: "Margin data",
      status: cogsCount > 0 ? "ready" : "needs_setup",
      detail:
        cogsCount > 0
          ? `${cogsCount} product cost record${cogsCount === 1 ? "" : "s"} loaded.`
          : "Add at least one product cost before testing discount protection.",
      href: "/app/cogs",
    },
    {
      key: "pixel",
      title: "Customer signal pixel",
      status: customerSignals.searches7d > 0 ? "ready" : "manual",
      detail:
        customerSignals.searches7d > 0
          ? `${customerSignals.searches7d} search signal${customerSignals.searches7d === 1 ? "" : "s"} captured in 7 days.`
          : "Install the pixel to capture live search/customer intent.",
      href: "/app/pixel",
    },
    {
      key: "queue",
      title: "Background worker queue",
      status: queueHealth.failed === 0 ? "ready" : "needs_setup",
      detail:
        queueHealth.failed === 0
          ? `${queueHealth.pending} pending, ${queueHealth.completedToday} completed today.`
          : `${queueHealth.failed} failed job${queueHealth.failed === 1 ? "" : "s"} need review.`,
      href: "/app",
    },
    {
      key: "email",
      title: "Email sending mode",
      status: process.env.RESEND_API_KEY ? "ready" : "manual",
      detail: process.env.RESEND_API_KEY
        ? "Real email provider key is configured."
        : "Zero-cost beta mode: email drafts/logs work, real sending can stay manual.",
    },
    {
      key: "billing",
      title: "Founder beta billing",
      status: process.env.SHOPIFY_BILLING_TEST === "false" ? "ready" : "manual",
      detail:
        process.env.SHOPIFY_BILLING_TEST === "false"
          ? "Live Shopify billing mode is configured."
          : "Billing is safe for demo/test mode. Switch live after first paid beta setup.",
      href: "/app/billing",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  return { readyCount, totalCount: items.length, items };
}

async function countCogsRows(storeId: string) {
  const { count } = await supabase
    .from("products_cogs")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId);

  return count || 0;
}
