import Subscriptions from "../subscriptions.class"

export async function botUnSubAll(ctx) {
    const subs = new Subscriptions('sub');
    await subs.unsubscribeAll();
    await ctx.reply('全部订阅已删除')
}
