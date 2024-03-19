import {StateUpdater} from "preact/hooks";

// List all the demos and display links/buttons to switch between them
interface SidebarProps {
	demos: WebGPUDemo[];
	currentDemo: number;
	setCurrentDemo: StateUpdater<number>;
}

export function Sidebar({demos, currentDemo, setCurrentDemo}: SidebarProps) {
	return (
		<div>
			{demos.map((demo, i) => i === currentDemo
				? <button disabled>{demo.title}</button>
				: <button onClick={() => setCurrentDemo(i)}>{demo.title}</button>
			)}
		</div>
	);
}
