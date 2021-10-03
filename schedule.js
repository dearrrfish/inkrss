import { mode, config } from "./config";
import Subscriptions from './utils/subscriptions.class';

const { reply, replyWhenError } = require(`./notifications/${mode}`);
const {
  MAX_SUBS_PER_SCHEDULE,
  MAX_SUB_ITEMS,
} = config

export async function handleScheduled(event) {
  const subs = new Subscriptions('sub');
  await subs.init();

  const updateableFeeds = subs.getUpdateableFeeds({
    max: MAX_SUBS_PER_SCHEDULE,
  });

  if (!updateableFeeds.length) {
    console.log('no updateable feeds found')
    return;
  }

  for (const feed of updateableFeeds) {
    try {
      await feed.fetch();
      const newUpdateId = feed.identify()
      if (!newUpdateId) {
        console.log('no new update id calculated, skip as no-modified content')
        continue;
      }

      const items = feed.getNewItems();
      if (!items.length) {
        console.log('no updateable items, skip')
      } else {
        let countProcessed = 0;
        while (items.length && ++countProcessed <= MAX_SUB_ITEMS) {
          const item = items.shift();
          if (DEBUG_DISABLE_NOTIFY == true) {
            console.log('dry-run item ', item);
          } else {
            console.log('sending item ', item);
            await reply(feed, item);
            console.log('sent item ', item.id)
          }
          feed.lastProcessedItem = item.id;
        }
      }

      // reset feed error count
      feed.clearError();

      // finished all items, store new feed's update id
      if (!items.length) {
        console.log('feed is up to date, new update id = ', newUpdateId);
        feed.upToDate(newUpdateId);
      }

      await subs.save();

    } catch (err) {
      console.log(err);
      const stillActive = feed.countError(err);
      if (!stillActive) {
        await replyWhenError(feed);
        await subs.save();
        break;
      }
      await subs.save();
    }

  }
}
