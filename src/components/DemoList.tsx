import { StateUpdater } from "preact/hooks";

// List all the demos and display links/buttons to switch between them
interface DemoListProps {
	demos: WebGPUDemo[];
	currentDemo: number;
	setCurrentDemo: StateUpdater<number>;
}

export function DemoList({ demos, currentDemo, setCurrentDemo }: DemoListProps) {
	return (
		<div class="demolist">
			{demos.map((demo, i) => i === currentDemo
				? <button disabled>{demo.title}</button>
				: <button onClick={() => setCurrentDemo(i)}>{demo.title}</button>
			)}
		</div>
	);
}
