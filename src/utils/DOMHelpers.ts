interface GPUSampleSectionInfo {
	title: string;
	description: string;
	initFn: (canvas: HTMLCanvasElement) => void;
}

export function createGPUSampleSection({
	title, description, initFn,
}: GPUSampleSectionInfo) {
	const section = document.createElement("section");
	const titleElm = document.createElement("h2");
	const descElm = document.createElement("p");
	const canvasContainer = document.createElement("div");
	const canvas = document.createElement("canvas");
	canvas.classList.add("gpu-example");
	canvasContainer.classList.add("canvas-container");
	section.appendChild(titleElm);
	section.appendChild(descElm);
	section.appendChild(canvasContainer);
	canvasContainer.appendChild(canvas);
	titleElm.textContent = title;
	descElm.textContent = description;
	initFn(canvas);
	return section;
}
