import { Router } from "itty-router";
import {
  getAssetFromKV,
  mapRequestToAsset,
} from "@cloudflare/kv-asset-handler";
import { handleScheduled } from "./schedule";
import { config, mode } from "./config";
import Subscriptions from './utils/subscriptions.class'
import { setTgBot } from "./bot";
const secret_path = config.SECRET_PATH;
const router = Router();
if (mode === "telegram") {
  setTgBot(router);
}

const errorHandler = (error) =>
  new Response(error.message || "Server Error", {
    status: error.status || 500,
  });

router.get("/", async () => {
  return new Response("Only the wise can see this page", { status: 200 });
});

router.get(`/${secret_path}`, async (req, e) => {
  const data = await KV.get("sub");
  if (!data) {
    await KV.put("sub", "[]");
  }
  return await getAssetFromKV(e, {
    mapRequestToAsset: (req) => {
      let defaultAssetKey = mapRequestToAsset(req);
      let url = new URL(defaultAssetKey.url);
      url.pathname = url.pathname.replace(secret_path, "/");
      return new Request(url.toString(), defaultAssetKey);
    },
  });
});

router.get(`/${secret_path}/feeds`, async () => {
  const raw = await KV.get("sub");
  return new Response(raw, { status: 200 });
});

router.post(`/${secret_path}/subitem`, async (req) => {
  const body = await req.json();
  if (body.url === undefined) {
    return new Response(
      JSON.stringify({
        status: 400,
        message: "Url not found",
      })
    );
  }

  try {
    const subs = new Subscriptions('sub');
    await subs.init();
    const feed = await subs.subscribe(body.url)
    return new Response(
      JSON.stringify({
        status: 200,
        message: `Sucessfully subscribed ${feed.title}`,
      })
    )
  } catch (err) {
    return new Response(JSON.stringify({
      status: 400,
      message: err.message
    }))
  }

});

router.post(`/${secret_path}/deleteitem`, async (req) => {
  const { url } = await req.json();
  try {
    const subs = new Subscriptions('sub');
    await subs.init();
    const deleted = await subs.unsubscribe(url);
    return new Response(JSON.stringify({
      status: 200,
      message: `Unsubscribe successfully - ${deleted.title}`
    }))
  } catch (err) {
    return new Response(JSON.stringify({
      status: 400,
      message: err.message,
    }))
  }
});

router.post(`/${secret_path}/active`, async (req) => {
  const { url, state } = await req.json();

  try {
    const subs = new Subscriptions('sub');
    await subs.init();
    await subs.toggleActive({ url, state });
    return new Response(JSON.stringify({
      status: 200,
      message: `修改成功，当前状态为 ${state ? "on" : "off"}`,
    }))
  } catch (err) {
    return new Response(JSON.stringify({
      status: 400,
      message: err.message,
    }))
  }

});

router.post(`/${secret_path}/telegraph`, async (req) => {
  const { url, state } = await req.json();

  try {
    const subs = new Subscriptions('sub');
    await subs.init();
    await subs.toggleTelegraph({ url, state });
    return new Response(JSON.stringify({
      status: 200,
      message: `修改成功，当前状态为 ${state ? "on" : "off"}`,
    }))
  } catch (err) {
    return new Response(JSON.stringify({
      status: 400,
      message: err.message,
    }))
  }
});

router.get("/test", async (req, e) => {
  e.waitUntil(handleScheduled(e));
});
router.get("*", async (req, e) => {
  try {
    return await getAssetFromKV(e);
  } catch (err) {
    return new Response(`An unexpected error occurred: ${err}`, { status: 500 });
  }
});

addEventListener("fetch", (e) => {
  e.respondWith(router.handle(e.request, e).catch(errorHandler));
});

addEventListener("scheduled", (event) => {
  event.waitUntil(handleScheduled(event));
});
