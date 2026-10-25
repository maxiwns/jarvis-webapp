
import { verifySession } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const authenticated = await verifySession(
    request,
    env
  );

  return Response.json(
    { authenticated },
    {
      status: authenticated ? 200 : 401,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
