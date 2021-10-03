import { mode, config } from "./config";
import Subscriptions from './utils/subscriptions.class';

const { reply, replyWhenError } = require(`./notifications/${mode}`);
const {
  MAX_SUBS_PER_SCHEDULE,
  MAX_SUB_ITEMS,
} = config

export async function handleScheduled(event) {
  const stats = {
    updated: [],
    updated_items: 0,
    errors: [],
    deactivated: []
  };

  const subs = new Subscriptions('sub');
  await subs.init();

  const updateableFeeds = subs.getUpdateableFeeds({
    max: MAX_SUBS_PER_SCHEDULE,
  });

  if (!updateableFeeds.length) {
    console.log('no updateable feeds found')
    return;
  }

  let countProcessed = 0;

  for (const feed of updateableFeeds) {
    stats.updated.push(feed.title);
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
          stats.updated_items = countProcessed;
        }
      }

      // reset feed error count
      feed.clearError();

      // finished all items, store new feed's update id
      if (!items.length) {
        console.log('feed is up to date, new update id = ', newUpdateId);
        feed.upToDate(newUpdateId);
      }

      // all above succeed here, let's quit the loop
      // - one processed feed per run due to KV write limit as 1,000
      break;

    } catch (err) {
      console.log(err);
      stats.errors.push(feed.title);
      const stillActive = feed.countError(err);
      if (!stillActive) {
        stats.deactivated.push(feed.title);
        // the feed reached max error count & deactivated
        // let's just stop & quit
        await replyWhenError(feed);
        break;
      }
      // otherwise, continue to next feed if no item processed yet
      if (!stats.updated_items) {
        break;
      }
      // or more aggressively, just quit
      // break;
    }
  }

  console.log('schedule run stats: ', stats);

  // save kv state at the end
  await subs.save();
}
