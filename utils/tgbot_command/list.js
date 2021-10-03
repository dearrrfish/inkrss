import { html } from "../html";
import Subscriptions from "../subscriptions.class";

export async function botList(ctx) {
  const subs = new Subscriptions('sub');
  await subs.init();
  const feeds = subs.feeds;
  if (!feeds.length) {
    await ctx.reply("还没有进行过订阅");
    return;
  }
  const msg = feeds.map(f => `[${html(f.title)}](${f.url})`).join('\n');
  await ctx.reply(msg, { parse_mode: "HTML" });
}
