import { helloTriangleInfo } from "./demos/01_hello_triangle";
import { getSlimeMoldDemo } from "./demos/05_slime_molds";
import { WebGPUSample } from "./components/WebGPUSample";
import { useState } from "preact/hooks";
import { DemoList } from "./components/DemoList";
import { Sidebar } from "./components/Sidebar";
import { DatGui } from "./components/DatGui";

const demos = [
	getSlimeMoldDemo(),
	helloTriangleInfo,
	// bufferSampleInfo,
	// textureSampleInfo,
];

export function App() {
	const [currentDemo, setCurrentDemo] = useState(0);
	const { settingsGui } = demos[currentDemo];
	const demo = demos[currentDemo];

	return <main>
		<h2>{demo.title}</h2>
		<p>{demo.description}</p>
		<Sidebar>
			{settingsGui && <DatGui gui={settingsGui} />}
			<DemoList
				demos={demos}
				currentDemo={currentDemo}
				setCurrentDemo={setCurrentDemo}
			/>
		</Sidebar>
		<WebGPUSample
			demo={demo}
			canvasOptions={{ showStats: true }}
		/>
	</main>
};
