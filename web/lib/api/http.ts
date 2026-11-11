export const MAX_BODY_BYTES = 10_240;

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, status);
}

/** Read a JSON body with a hard size cap. Returns an error Response on failure. */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown | Response> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return bad(`Body larger than ${maxBytes} bytes.`, 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    return bad("Body is not valid JSON.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
