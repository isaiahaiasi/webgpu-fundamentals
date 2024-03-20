import { GPUCanvas } from "./GPUCanvas";

interface WebGPUSampleProps {
	canvasOptions: Partial<CanvasDisplayOptions>;
	demo: WebGPUDemo;
}

export function WebGPUSample({ demo, canvasOptions }: WebGPUSampleProps) {
	return <section>
		<GPUCanvas demo={demo} options={canvasOptions} />
	</section>
};
