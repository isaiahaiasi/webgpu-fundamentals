import { helloTriangleInfo } from "./demos/01_hello_triangle";
import { getSlimeMoldDemo } from "./demos/05_slime_molds";
import { WebGPUSample } from "./components/WebGPUSample";
import { useState } from "preact/hooks";
import { Sidebar } from "./components/Sidebar";

const demos = [
	helloTriangleInfo,
	// bufferSampleInfo,
	// textureSampleInfo,
	getSlimeMoldDemo(),
];

export function App() {
	const [currentDemo, setCurrentDemo] = useState(0);

	return <div>
		<Sidebar demos={demos} currentDemo={currentDemo} setCurrentDemo={setCurrentDemo} />
		<WebGPUSample
			demo={demos[currentDemo]}
			canvasOptions={{ showStats: true }}
		/>
	</div>
};
