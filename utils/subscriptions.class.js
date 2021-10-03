/**
 * Globals: KV
 */
// import { config } from '../config';
import Feed from './feed.class';

export default class Subscriptions {
  constructor(kv) {
    this._kv = kv;
  }

  async init() {
    this._raw = await KV.get(this._kv);

    if (!this._raw) {
      this.log('warn', `unable to find KV for key: ${this._kv}. initilaizing with empty list.`);
      this._raw = '[]';
      await KV.put(this._kv, this._raw);
    }

    this._json = JSON.parse(this._raw);
    this._feeds = this._json.map(f => new Feed(f));
  }

  get feeds() {
    return this._feeds || [];
  }

  hasFeed({ url, title }) {
    return this._feeds.some(f => f.url == url || f.title == title);
  }

  getFeed({ url }) {
    return this._feeds.find(f => f.url == url);
  }

  getActiveFeeds() {
    return this._feeds.filter(f => f.isActive());
  }

  getErrorFeeds() {
    return this._feeds.filter(f => f.isError());
  }

  getUpdateableFeeds({ now = new Date(), sort = true, max = 0 } = {}) {
    let feeds = this._feeds.filter(f => f.isUpdateable(now));
    if (sort) {
      feeds.sort((a, b) => a.lastUpdateTime - b.lastUpdateTime);
    }
    if (max > 0) {
      feeds = feeds.slice(0, max);
    }
    return feeds;
  }

  async subscribe(url) {
    const feed = new Feed({ url, new: true });
    await feed.fetch();
    feed.clearError();
    feed.activate();

    if (this.hasFeed(feed)) {
      throw new Error('Already subscribed')
    }

    this._feeds.push(feed);
    await this.save();
    return feed;
  }

  async unsubscribe(url) {
    const idx = this._feeds.findIndex(f => f.url == url);
    if (idx == -1) {
      throw new Error('Url not found')
    }
    const [deleted] = this._feeds.splice(idx, 1);
    await this.save();
    return deleted;
  }

  async unsubscribeAll() {
    this._feeds = [];
    await this.save();
  }

  async toggleActive({ url, state }) {
    const feed = this.getFeed({ url });
    if (!feed || state === undefined) {
      throw new Error('Invalid input of feed')
    }
    if (feed.isActive() != state) {
      state ? feed.activate() : feed.deactivate();
      feed.clearError();
      await this.save()
    }
  }

  async toggleTelegraph({ url, state }) {
    const feed = this.getFeed({ url });
    if (!feed || state === undefined) {
      throw new Error('Invalid input of feed')
    }
    if (feed.telegraph != state) {
      feed.telegraph = state;
      await this.save();
    }
  }

  async save() {
    const feeds = this._feeds.map(f => f.storage);
    // this.log(null, JSON.stringify(feeds))
    await KV.put(this._kv, JSON.stringify(feeds));
  }

  log(level, ...args) {
    level = level && ['log', 'warn', 'error'].indexOf(level) != -1 ? level : 'log';
    console[level](`SUBS<>[${level.toUpperCase()}] `, ...args);
  }
}
