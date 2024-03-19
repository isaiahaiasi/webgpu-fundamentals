import { helloTriangleInfo } from "./demos/01_hello_triangle";
import { slimeMoldInfo } from "./demos/05_slime_molds";
import { WebGPUSample } from "./components/WebGPUSample";
import { useState } from "preact/hooks";
import { Sidebar } from "./components/Sidebar";

const demos = [
	helloTriangleInfo,
	// bufferSampleInfo,
	// textureSampleInfo,
	slimeMoldInfo,
];

export function App() {
	const [currentDemo, setCurrentDemo] = useState(0);
	const { title, description, init } = demos[currentDemo];

	return <div>
		<Sidebar demos={demos} currentDemo={currentDemo} setCurrentDemo={setCurrentDemo} />
		<WebGPUSample
			title={title}
			description={description}
			init={init}
			canvasOptions={{ showStats: true }}
		/>
	</div>
};
