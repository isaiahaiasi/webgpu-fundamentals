import {slimeMoldInfo} from "./demos/05_slime_molds";
import {WebGPUSample} from "./components/WebGPUSample";

const {title, description, init} = slimeMoldInfo;

export function App() {
	return <WebGPUSample
		title={title}
		description={description}
		init={init}
		canvasOptions={{showStats: true}}
	/>
};
