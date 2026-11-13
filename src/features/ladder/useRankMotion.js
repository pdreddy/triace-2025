import { useLayoutEffect, useRef } from 'react';

// Animate the actual movement of keyed rows after a rank change, not each data poll.
export function useRankMotion(list, seasonId, order) {
  const previous = useRef({ seasonId, positions: new Map() });
  useLayoutEffect(() => {
    const nodes = [...(list.current?.children || [])];
    const positions = new Map(nodes.map(node => [node.dataset.playerId, { top: node.offsetTop, rank: node.dataset.rank }]));
    const animations = [];
    if (previous.current.seasonId === seasonId && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of nodes) {
        const before = previous.current.positions.get(node.dataset.playerId), after = positions.get(node.dataset.playerId);
        if (before && before.rank !== after.rank && before.top !== after.top) animations.push(node.animate([
          { transform: `translateY(${before.top - after.top}px)`, borderColor: '#d9f24b' },
          { transform: 'translateY(0)', borderColor: getComputedStyle(node).borderColor }
        ], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' }));
      }
    }
    previous.current = { seasonId, positions };
    return () => animations.forEach(animation => animation.cancel());
  }, [list, seasonId, order]);
}
