export const isAtomOrRss = (xml) => {
  const re = /<(?<tag>feed|rss) [^>]*>/im;
  const match = xml.match(re);
  const tag = (match && match.groups.tag).toLowerCase();
  return tag == 'feed' ? 'atom' : (tag == 'rss' ? 'rss' : '')
}

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const removeCDATA = str => str.replace("<![CDATA[", "").replace("]]>", "").trim();

const findInXmlPath = (xml, pathStr = '') => {
  const path = pathStr.split('.');
  const tag = path[path.length - 1];
  const start = path.map(t => `<${t}[^>]*>`).join("[\\s\\S]*?");
  const end = path.map(t => `</${t}>`).reverse().join("[\\s\\S]*?");
  const reStr = `${start}(?<${tag}>[\\s\\S]*?)${end}`;
  const re = new RegExp(reStr, 'mi');
  const match = xml.match(re);
  return match && match.groups[tag] || '';
}

const findAllInXmlPath = (xml, pathStr = '') => {
  const path = pathStr.split('.');
  const tag = path[path.length - 1];
  const start = path.map(t => `<${t}[^>]*>`).join(`[\\s\\S]*?`);
  const end = path.map(t => `</${t}>`).reverse().join(`[\\s\\S]*?`);
  const reStr = `${start}(?<${tag}>[\\s\\S]*?)${end}`;
  const re = new RegExp(reStr, 'gmi');
  const matches = xml.matchAll(re);
  return Array.from(matches, m => m.groups[tag]);
}

const findLinkHref = (xml) => {
  const re = /<link [\s\S]*?href="(?<link>[\s\S]*?)"[\s\S]*?>/mi;
  const m = xml.match(re);
  return m && m.groups.link || '';
}

// ref: https://validator.w3.org/feed/docs/atom.html
export const parseAtomXml = (xml) => {
  const feed = {};

  // required <feed /> elements
  ;[
    'id',
    'title',
    'updated'
  ].forEach(t => {
    feed[t] = removeCDATA(findInXmlPath(xml, `feed.${t}`));
  })

  // entries
  feed.entries = findAllInXmlPath(xml, 'entry')
    .map(e => {
      const entry = {};
      ;[
        // required
        'title',
        'id',
        'updated',

        // optional
        'published',
        'content',
        'summary',
      ].forEach(t => {
        entry[t] = removeCDATA(findInXmlPath(e, t));
      });
      entry.link = findLinkHref(e);

      return entry;
    });

  return feed;
}

// ref: https://validator.w3.org/feed/docs/rss2.html
export const parseRssXml = (xml) => {
  const channel = {};

  // <channel /> elements
  ;[
    // required
    'title',
    'link',
    'description',

    // optional
    'pubDate',
    'lastBuildDate',
    // 'skipHours',
    // 'skipDays',
  ].forEach(t => {
    channel[t] = removeCDATA(findInXmlPath(xml, `channel.${t}`));
  })

  // <item /> elements
  channel.items = findAllInXmlPath(xml, 'item')
    .map(e => {
      const item = {};
      ;[
        // all optional
        'guid',
        'title',
        'description',
        'link',
        'pubDate',
      ].forEach(t => {
        item[t] = removeCDATA(findInXmlPath(e, t));
      });

      return item;
    });

  return channel;
}
