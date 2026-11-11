import { runTriage } from "@/lib/api/handlers";
import { json, options, readJson } from "@/lib/api/http";
import { DESCRIPTIONS } from "@/lib/api/docs";

export function GET() {
  return json(DESCRIPTIONS.triage);
}

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const outcome = await runTriage(body, {
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL,
  });
  return json(outcome.body, outcome.status);
}
