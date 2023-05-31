import { useEffect, useRef } from "preact/hooks";
import Stats from "stats.js";

interface StatsRendererProps {
	stats: Stats;
}

export function StatsRenderer({ stats }: StatsRendererProps) {
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		stats.showPanel(0);
		stats.dom.style.position = "absolute";
		ref.current?.appendChild(stats.dom);
	}, []);

	return <div ref={ref} />
}
