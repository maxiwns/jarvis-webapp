
export function onRequestGet() {
  return Response.json({
    name: "JARVIS",
    status: "online",
    component: "Pages Functions",
    version: "0.8"
  }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
