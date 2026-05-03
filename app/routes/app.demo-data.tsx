import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { clearDemoData, seedDemoData } from "~/services/demo-data.server";
import { authenticate } from "~/shopify.server";
import { ensureStoreForSession } from "~/utils/store.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  return redirect("/app");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await ensureStoreForSession(session).catch((error) => {
    console.error("Demo data store sync failed:", error);
    return null;
  });

  if (!store) {
    return redirect("/app?demo=store_sync_failed");
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "seed");

  if (intent === "clear") {
    await clearDemoData(store.id).catch((error) => {
      console.error("Demo data clear failed:", error);
      return null;
    });
    return redirect("/app?demo=cleared");
  }

  const seeded = await seedDemoData(store.id)
    .then(() => true)
    .catch((error) => {
      console.error("Demo data seed failed:", error);
      return false;
    });

  if (!seeded) {
    return redirect("/app?demo=seed_failed");
  }

  return redirect("/app?demo=seeded");
};
