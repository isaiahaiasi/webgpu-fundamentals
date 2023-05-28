import { init } from "./06_slime_molds";
import { WebGPUSample } from "./components/wgpu_sample";

export function App() {
	return <WebGPUSample
		title="Slime Molds"
		description="Slime mold simulation, compute shader experiments."
		initFn={init}
	/>
};
