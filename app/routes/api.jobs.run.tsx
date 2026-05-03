import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { processDueAgentJobs } from "~/services/job-queue.server";

const DEFAULT_JOB_LIMIT = 10;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return runJobs(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return runJobs(request);
};

async function runJobs(request: Request) {
  const secret = process.env.JOB_RUNNER_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!secret && process.env.NODE_ENV === "production") {
    return json({ error: "Job runner secret is not configured" }, { status: 503 });
  }

  if (secret && authHeader !== `Bearer ${secret}` && token !== secret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number(url.searchParams.get("limit") || DEFAULT_JOB_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50)
    : DEFAULT_JOB_LIMIT;

  try {
    const result = await processDueAgentJobs(limit);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("Job runner failed:", error);
    return json({ error: "Job runner failed" }, { status: 503 });
  }
}
