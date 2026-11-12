import { describeRules } from '../../../functions/lib/singlesLadder/config.js';
import { useLadder } from './LadderContext';
import { When } from './ui';

// The rules as sentences, generated from this season's configuration. Nothing here is written by hand.
export default function RulesPage() {
  const { season, rules } = useLadder();
  return (
    <>
      <p className="lmeta">Rules version {season.rules.version}, last changed <When at={season.rules.updatedAt} />. Each challenge keeps the rules that applied when it was sent.</p>
      <div className="rules-grid">
        {describeRules(rules).map(section => <section className="lcard" key={section.title}><h2>{section.title}</h2><ul>{section.lines.map(line => <li key={line}>{line}</li>)}</ul></section>)}
      </div>
    </>
  );
}
