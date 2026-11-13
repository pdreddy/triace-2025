import { useLayoutEffect, useRef } from 'react';

// Animate the actual movement of keyed rows after a rank change, not each data poll.
export function useRankMotion(list, seasonId, order, playback) {
  const previous = useRef({ seasonId, positions: new Map() });
  useLayoutEffect(() => {
    const nodes = [...(list.current?.children || [])];
    const positions = new Map(nodes.map(node => [node.dataset.playerId, { top: node.offsetTop, rank: node.dataset.rank }]));
    const animations = [];
    const ranks = new Map(nodes.map(node => [Number(node.dataset.rank), node.offsetTop]));
    const outcome = playback?.challenge?.outcome;
    const canReplay = outcome && Object.entries(outcome.ranksAfter || {}).every(([id, rank]) => positions.get(id)?.rank === String(rank));
    if (previous.current.seasonId === seasonId && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of nodes) {
        const before = previous.current.positions.get(node.dataset.playerId), after = positions.get(node.dataset.playerId);
        const replayFrom = canReplay ? ranks.get(outcome.ranksBefore?.[node.dataset.playerId]) : undefined;
        const from = replayFrom ?? (before && before.rank !== after.rank ? before.top : undefined);
        if (from !== undefined && from !== after.top) {
          const delta = from - after.top, color = delta > 0 ? '#d9f24b' : '#79e5c9';
          node.classList.add('rank-reordering');
          const animation = node.animate([
            { transform: `translateY(${delta}px)`, borderColor: color },
            { transform: `translate(${delta > 0 ? 10 : -10}px, ${delta / 2}px)`, borderColor: color, offset: .5 },
            { transform: 'translate(0, 0)', borderColor: getComputedStyle(node).borderColor }
          ], { duration: playback ? 1100 : 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
          animation.onfinish = () => node.classList.remove('rank-reordering');
          animations.push({ animation, node });
        }
      }
    }
    previous.current = { seasonId, positions };
    return () => animations.forEach(({ animation, node }) => { animation.cancel(); node.classList.remove('rank-reordering'); });
  }, [list, seasonId, order, playback]);
}
