import { main as triangleMain } from './01_hello_triangle';
import { main as simpleComputeMain } from './02_hello_compute';
import { main as textureMain } from "./03_textures";

import './style.css';

function getWebGPUExperiment(
	title: string, id: string, fn: (c: HTMLCanvasElement) => void
) {
	const section = document.createElement("section");
	const titleElm = document.createElement("h2");
	const canvas = document.createElement("canvas");
	canvas.classList.add("gpu-example");
	canvas.id = id;
	section.appendChild(titleElm);
	section.appendChild(canvas);
	titleElm.textContent = title;
	fn(canvas);
	return section;
}

// create & append Sections for each experiment
[{
	title: "01_Hello_Triangle",
	id: "hello-triangle",
	fn: triangleMain,
}, {
	title: "02_Hello_Compute",
	id: "hello-compute",
	fn: simpleComputeMain,
}, {
	title: "02_Hello_Texture",
	id: "hello-texture",
	fn: textureMain,
}].map(({ title, id, fn }) => {
	document.querySelector('#app')?.appendChild(getWebGPUExperiment(title, id, fn));
});
