import {tick} from "../../functions/_lib/background.js";

export default {
  async scheduled(event,env) { await tick(env); },
  fetch() { return new Response("Not found",{status:404}); }
};
