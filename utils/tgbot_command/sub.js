import Subscriptions from '../subscriptions.class'

export async function botSub(ctx) {
    const { entities, text } = ctx.update.message;
    const ent = entities.find(e => e.type == 'url');
    const url = ent
        ? text.substring(
            ent.offset,
            ent.offset + ent.length
        )
        : '';

    if (!url) {
        await ctx.reply('请输入格式正确的订阅源');
        return;
    }

    const subs = new Subscriptions('sub');
    await subs.init();

    if (subs.hasFeed({ url })) {
        await ctx.reply('已经订阅过此信息源');
        return;
    }

    try {
        const feed = await subs.subscribe(url);
        await ctx.reply(`成功订阅${feed.title}`)
    } catch (err) {
        await ctx.reply('订阅失败')
    }

}