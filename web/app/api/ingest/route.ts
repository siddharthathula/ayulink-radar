import { runIngest } from "@/lib/api/handlers";
import { json, options, readJson } from "@/lib/api/http";
import { DESCRIPTIONS } from "@/lib/api/docs";

export function GET() {
  return json(DESCRIPTIONS.ingest);
}

export function OPTIONS() {
  return options();
}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const outcome = runIngest(body);
  return json(outcome.body, outcome.status);
}
