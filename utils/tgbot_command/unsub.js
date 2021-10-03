export async function botUnSub(ctx) {
    const { entities, text } = ctx.update.message;
    const ent = entities.find(e => e.type == 'url');
    const url = ent
        ? text.substring(
            ent.offset,
            ent.offset + ent.length
        )
        : '';

    if (!url) {
        await ctx.reply('我需要的是url啦');
        return;
    }

    const subs = new Subscriptions('sub');
    await subs.init();

    if (!subs.hasFeed({ url })) {
        await ctx.reply('没有找到相关到url');
        return;
    }

    try {
        const feed = await subs.unsubscribe(url);
        await ctx.reply(`删除成功 ${feed.title}`);
    } catch (err) {
        await ctx.reply('删除失败');
    }

}
