import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

const agents = [
  {
    name: "Margin Guardian",
    description: "Protects profit before any discount or recovery offer goes live.",
  },
  {
    name: "Cart Sniper",
    description: "Recovers abandoned carts with controlled, margin-safe follow-ups.",
  },
  {
    name: "AI Personal Shopper",
    description: "Lifts AOV with guided bundles and product recommendations.",
  },
  {
    name: "Retention Engine",
    description: "Brings customers back using search intent and buying signals.",
  },
  {
    name: "Revenue Analyst",
    description: "Turns agent activity into simple ROI and next-step reports.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.kicker}>ANOTAI for Shopify</div>
        <h1 className={styles.heading}>
          Hire a 5-person AI revenue team without hiring employees.
        </h1>
        <p className={styles.text}>
          ANOTAI gives solo Shopify founders autonomous agents for margin
          protection, cart recovery, upsells, retention, and revenue reporting.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shopify store domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
              />
            </label>
            <button className={styles.button} type="submit">
              Open ANOTAI
            </button>
          </Form>
        )}
      </section>

      <section className={styles.panel} aria-label="Starter agent team">
        <div className={styles.panelHeader}>
          <span>Starter team</span>
          <strong>$999/mo</strong>
        </div>
        <div className={styles.agentGrid}>
          {agents.map((agent) => (
            <article className={styles.agentCard} key={agent.name}>
              <h2>{agent.name}</h2>
              <p>{agent.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
