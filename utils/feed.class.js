import { config } from '../config';
import {
  isAtomOrRss,
  parseAtomXml,
  parseRssXml,
} from './xml-feed-parser'

const FEED_TYPES = {};
['UPDATES', 'RANKINGS', 'EVENTS'].forEach(t => { FEED_TYPES[t] = t; });

const FEED_UPDATE_ID_TYPE = {};
[
  'CONDITIONAL_GET',
  'LAST_BUILD_TAG',
  'FIRST_ITEM',
  'FIRST_ITEM_TITLE'
].forEach(t => { FEED_UPDATE_ID_TYPE[t] = t; });


export default class Feed {
  constructor(input = {}) {
    this.__ = input;
    Object.keys(this.__).forEach(k => {
      this[`_${k}`] = this.__[k];
    });

  }

  get title() { return this._title; }
  // set title(val) { if (val) this._title = string(val); }

  get url() { return this._url; }
  // set url(val) { this._url = val; }

  get format() { return this._format; }
  // set format(val) { this._type = FEED_FORMATS.indexOf(val) != -1 ? 'xml' : val; }

  get type() { return this._type; }
  set type(val) { this._type = FEED_TYPES[val] || FEED_TYPES.UPDATES; }

  get tags() { return this._tags || []; }
  set tags(val) { this._tags = val; }

  get telegraph() { return this._telegraph; }
  set telegraph(val) { this._telegraph = val; }

  get updateIdType() { return this._updateIdType || 'UNKNOWN'; }

  get lastUpdateTime() { return this._lastUpdateTime; }

  get lastProcessedItem() {
    if (this._type == FEED_TYPES.RANKINGS) {
      if (!(this._lastProcessedItem || '').startsWith('[')) {
        this._lastProcessedItem = '[]';
      }
      return JSON.parse(this._lastProcessedItem);
    } else {
      return this._lastProcessedItem;
    }
  }
  set lastProcessedItem(val) {
    if (this._type == FEED_TYPES.RANKINGS) {
      const processed = this.lastProcessedItem;
      processed.push(val);
      this._lastProcessedItem = JSON.stringify(processed);
    } else {
      this._lastProcessedItem = val;
    }
  }


  activate() { this._active = true; }
  deactivate() { this._active = false; }
  isActive() { return this._active ? true : false; }

  isError() { return this._errorTimes >= config.MAX_ERROR_TIMES; }

  isJson() { return this._format == 'json'; }
  isAtom() { return this._format == 'xml_atom'; }
  isRss() { return this._format == 'xml_rss'; }
  isXml() { return this._format.startsWith('xml'); }

  isUpdateable(now = new Date()) {
    const timeSinceLastUpdate = now - new Date(this._lastUpdateTime);
    // this.log(null, 'timeSlinceLastUpdate=', timeSinceLastUpdate)
    return this.isActive()
      && timeSinceLastUpdate > config.SUB_FETCH_INTERVAL_MIN * 60 * 1000
      && (
        this._errorTimes == 0
        || timeSinceLastUpdate > config.SUB_ERROR_RETRY_INTERVAL_MIN * 60 * 1000
      );
  }

  hasTag(tag) { return this._tags.indexOf(tag) != -1; }
  addTag(...tags) { this._tags = [...new Set(...this._tags, ...tags)]; }
  removeTag(...tags) {
    const indexes = tags
      .map(t => this._tags.indexOf(t))
      .filter(i => i != -1)
      .sort();
    while (indexes.length) this._tags.splice(indexes.pop(), 1);
  }

  countError(err) {
    this._errorTimes += 1;
    if (this._errorTimes >= config.MAX_ERROR_TIMES) {
      this.log('error', `reached MAX_ERROR_TIMES = ${config.MAX_ERROR_TIMES}`);
      this.deactive();
    }
    return this.isActive();
  }

  clearError() {
    this._errorTimes = 0;
  }

  async fetch({
    headers = {},
  } = {}) {
    if (!this._url) {
      throw new Error('no feed url defined');
    }

    // HEADERS['Content-Type']
    if (!this._format || this._new) {
      // do nothing
      // the feed requires valiation process
    } else if (this.isJson()) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    } else {
      headers['Content-Type'] = 'text/xml; charset=utf-8'
    }

    // HEADERS['If-None-Match']
    if (this._etag) {
      headers['If-None-Match'] = this._etag;
      this._updateIdType = FEED_UPDATE_ID_TYPE.CONDITIONAL_GET;
    }
    // HEADERS['If-Modified-Since']
    else if (this._lastModified) {
      headers['If-Modified-Since'] = this._lastModified;
      this._updateIdType = FEED_UPDATE_ID_TYPE.CONDITIONAL_GET;
    }

    this.log(null, 'fetching with headers: ', headers);

    this._resp = await fetch(this._url, { headers });

    this.log(null, 'response status: ', this._resp.status);

    this._lastUpdateTime = new Date();

    // 304 Not Modified
    if (this._resp.status == 304) {
      this.log(null, '304 Not Modified received.')
      this._notModified = true;
      return;
    }

    if (!this._resp.ok) {
      this.log('error', `failed response: ${this._resp.status}: ${this._resp.statusText}`)
      throw new Error(
        'failed to fetch feed',
        { cause: this._resp }
      );
    }

    // check if feed url support CONDITIONAL_GET
    this._resp_lastModified = this._resp.headers.get('Last-Modified');
    this._resp_etag = this._resp.headers.get('ETag');
    if (this._resp_lastModified || this._resp_etag) {
      this._updateIdType = FEED_UPDATE_ID_TYPE.CONDITIONAL_GET;
      // TODO: check if we need to confirm If-Modified-Since & If-None-Match here
    }

    if (this.isJson() || /json/i.test(this._resp.headers.get('Content-Type'))) {
      this._json = await this._resp.json();
      this._format = 'json';
    } else {
      this._xml = await this._resp.text();
      if (!this._format) {
        this._format = `xml_${isAtomOrRss(this._xml)}`;
      }


      if (this.isAtom()) {
        this._json = parseAtomXml(this._xml);
      } else if (this.isRss()) {
        this._json = parseRssXml(this._xml);
      } else {
        throw new Error('unsupported xml feed format');
      }
    }


    if (!this._json) {
      throw new Error('failed to parse feed')
    }

    this._title = this._json.title.replace(/\n/g, '').trim();

    // this.log(null, JSON.stringify(this._json, null, 2));

  }

  identify() {
    if (this._notModified === true) { return null; }

    let newId;

    if (this._updateIdType == FEED_UPDATE_ID_TYPE.CONDITIONAL_GET) {
      newId = `${this._resp_lastModified || ''}|${this._resp_etag || ''}`;
    }

    if (!this._json) {
      throw new Error('no feed content fetched')
    }

    // ref: https://www.jsonfeed.org/version/1/
    if (this.isJson()) {
      newId = this._json.items[0].id;
    }
    else if (this.isAtom()) {
      return this._json.updated
        || this._json.entries[0].id
        || this._json.entries[0].link
        || this._json.entries[0].title
        ;
    }
    else if (this.isRss()) {
      return this._json.lastBuildDate
        || this._json.items[0].guid
        || this._json.items[0].link
        || this._json.items[0].title
        ;
    }


    // TODO handle exceptions

    return (newId && newId != this._lastUpdateId)
      ? newId
      : null
  }

  detectNewItemsMethodType() {
    const items = this._json.items || this._json.entries;
    const allDateStrings = items.map(i => {
      const pubDate = i.date_published || i.date_modified // json feed
        || i.published || i.updated // atom feed
        || i.pubDate  // rss feed
        ;
      return pubDate;
    }
    );

    if (new Set(allDateStrings).size <= 1) {
      return FEED_TYPES.RANKINGS;
    }

    const allDates = allDateStrings.map(s => new Date(s));

    if (
      !allDates.every((v, i, a) => !i || a[i - 1] <= v)
      && !allDates.every((v, i, a) => !i || a[i - 1] >= v)
    ) {
      return FEED_TYPES.RANKINGS;
    }

    return FEED_TYPES.UPDATES  // default
  }

  filterNewItemsByDate() {
    let _items = [];
    if (this.isJson()) {
      _items = this._json.items.sort((a, b) => {
        if (a.date_published && b.date_published) {
          return new Date(a.date_published) - new Date(b.date_published);
        }
        else if (a.date_modified && b.date_modified) {
          return new Date(a.date_modified) - new Date(b.date_modified);
        }
        return 0;
      });

      if (this._lastProcessedItem) {
        _items = _items.slice(_items.findIndex(item => item.id == this._lastProcessedItem) + 1)
      }

    }
    else if (this.isAtom()) {
      _items = this._json.entries.sort((a, b) => {
        if (a.updated && b.updated) {
          return new Date(a.updated) - new Date(b.updated);
        }
        return 0;
      })

      if (this._lastProcessedItem) {
        _items = _items.slice(_items.findIndex(item => item.id == this._lastProcessedItem) + 1)
      }


    }
    else if (this.isRss()) {
      _items = this._json.items.sort((a, b) => {
        if (a.pubDate && b.pubDate) {
          return new Date(a.pubDate) - new Date(b.pubDate);
        }
        return 0;
      })

      if (this._lastProcessedItem) {
        _items = _items.slice(_items.findIndex(item => item.guid == this._lastProcessedItem) + 1)
      }
    }

    return _items;
  }

  filterNewItemsByIDs() {
    const newItems = [];
    const processedItems = [];
    const lastProcessedItems = this.lastProcessedItem;
    const items = this._json.items || this._json.entries;
    items.forEach(item => {
      const id = item.id || item.guid;
      if (lastProcessedItems.indexOf(id) != -1) {
        processedItems.push(id);
      } else {
        newItems.push(item);
      }
    });

    this._lastProcessedItem = JSON.stringify(processedItems);

    return newItems.reverse();
  }

  constructItems(items) {
    if (this.isJson()) {
      // ref: https://www.jsonfeed.org/version/1/
      return items.map(i => ({
        id: i.id,
        title: i.title || i.summary,
        link: i.url,
        content: i.content_html || i.content_text,
        pubDate: i.date_published || i.date_modified,
        tags: i.tags,
      }));

    } else if (this.isAtom()) {
      // ref: https://validator.w3.org/feed/docs/atom.html
      return items.map(i => ({
        id: i.id,
        title: i.title,
        link: i.link,
        content: i.content || i.summary,
        pubDate: i.published || i.updated,
      }))
    } else if (this.isRss()) {
      // ref: https://validator.w3.org/feed/docs/atom.html
      return items.map(i => ({
        id: i.guid,
        title: i.title,
        link: i.link,
        content: i.description,
        pubDate: i.pubDate,
      }))
    }

    return items;

  }

  getNewItems() {
    if (!this._type) {
      this._type = this.detectNewItemsMethodType();
      this.log(null, `set feed type to ${this._type}`);
    }

    switch (this._type) {
      case FEED_TYPES.UPDATES:
        return this.constructItems(this.filterNewItemsByDate());
      case FEED_TYPES.RANKINGS:
        return this.constructItems(this.filterNewItemsByIDs());
      default:
        return [];
    }
  }

  upToDate(newId) {
    this._lastUpdateId = newId;
    this._lastModified = this._resp_lastModified;
    this._etag = this._resp_etag;
  }

  get storage() {
    return {
      title: this._title,
      url: this._url,
      active: this._active,
      format: this._format,
      type: this._type,
      tags: this._tags,
      telegraph: this._telegraph,
      errorTimes: this._errorTimes,
      lastModified: this._lastModified,
      etag: this._etag,
      lastUpdateTime: this._lastUpdateTime,
      lastUpdateId: this._lastUpdateId,
      lastProcessedItem: this._lastProcessedItem,
      updateIdType: this._updateIdType,
    };
  }

  log(level, ...args) {
    level = level && ['log', 'warn', 'error'].indexOf(level) != -1 ? level : 'log';
    console[level](`FEED|${(this._title || '').slice(0, 20)}> ${level.toUpperCase()}: `, ...args);
  }

}
