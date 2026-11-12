import { Link, Outlet, useLocation } from 'react-router-dom';
import { EmptyState } from '../../components/UI';
import { useLadder } from './LadderContext';
import { Chip } from './ui';

const STATUS = { draft: ['Not open yet', 'muted'], active: ['Season open', 'good'], frozen: ['Frozen', 'sky'], closed: ['Closed', 'muted'] };
// Frame for every /ladder page: season title, state, and honest loading / unavailable / empty states.
export default function LadderLayout() {
  const { loading, error: loadError, seasons, seasonId, setSeasonId, meta, admin, season } = useLadder(), organizer = useLocation().pathname.startsWith('/ladder/organizer');
  if (loading) return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading the ladder…</div>;
  const error = loadError || (seasonId && !season ? 'This season’s data could not be read.' : '');
  const ids = Object.keys(seasons).sort((a, b) => seasons[b].createdAt - seasons[a].createdAt);
  return (
    <section className="page ladder-screen">
      <header className="ladder-head">
        <div>
          <p className="eyebrow">PPRC Singles Ladder</p>
          <h1>{meta?.name || 'Singles Ladder'}</h1>
        </div>
        <div className="ladder-head-side">
          {meta && <Chip tone={STATUS[meta.status][1]}>{STATUS[meta.status][0]}</Chip>}
          {ids.length > 1 && <label className="season-pick"><span className="sr-only">Season</span><select value={seasonId} onChange={e => setSeasonId(e.target.value)}>{ids.map(id => <option key={id} value={id}>{seasons[id].name}</option>)}</select></label>}
        </div>
      </header>
      {error ? <EmptyState icon="warn" title="The ladder is unavailable">{error}<span>Nothing is shown rather than out-of-date or made-up standings. Please try again shortly.</span></EmptyState>
        : !seasonId && !organizer ? <EmptyState icon="ladder" title="No ladder season yet">An organizer has not created a Singles Ladder season.{admin && <Link className="button small" to="/ladder/organizer">Create a season</Link>}</EmptyState>
        : <Outlet />}
    </section>
  );
}
