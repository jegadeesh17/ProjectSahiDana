import { biText, t, type StringId } from '../i18n/strings';
import { VERTICAL_CLASS } from '../domain/feedNames';
import type { FeedItem } from '../domain/types';
import { Bi } from '../i18n/Bi';
import { feedLabel } from '../i18n/feedLabel';
import { useLang } from '../i18n/LanguageProvider';

/** One name in the selected language. In Hindi mode a team-asserted Devanagari name carries a dagger. */
export function FeedName({ feed }: { feed: FeedItem }) {
  const { lang } = useLang();
  const name = feedLabel(feed, lang);
  const showsDeva = lang === 'hi' && feed.localNameDeva !== null;
  const fallbackEnInHi = lang === 'hi' && feed.localNameDeva === null;
  const teamAsserted = showsDeva && feed.localNameDevaProvenance === 'team-asserted';
  const note = biText(t('note_team_asserted_name'));
  return (
    <span className="feedname">
      <span
        className="feedname-primary"
        lang={showsDeva ? 'hi' : 'en'}
        data-lang-exempt={fallbackEnInHi ? 'feed-no-deva' : undefined}
      >
        {name}
        {teamAsserted && (
          <sup className="ta" title={note} aria-label={note}>
            †
          </sup>
        )}
      </span>
    </span>
  );
}

/** A small soft dot: one muted hue per feed vertical, never the only carrier of meaning. */
export function FeedChip({ feed }: { feed: FeedItem }) {
  const labelId: StringId = `vertical_${feed.vertical}`;
  return (
    <span
      className={`chip ${VERTICAL_CLASS[feed.vertical]}`}
      data-vertical={feed.vertical}
      title={biText(t(labelId))}
    >
      <span className="sr-only">
        <Bi id={labelId} />
      </span>
    </span>
  );
}

