import { GPUCanvas } from "./GPUCanvas";

interface WebGPUSampleProps extends GPUSampleSectionInfo {
	canvasOptions: Partial<CanvasDisplayOptions>;
}

export function WebGPUSample({ title, description, init, canvasOptions }: WebGPUSampleProps) {

	return <section>
		<h2>{title}</h2>
		<p>{description}</p>
		<GPUCanvas init={init} options={canvasOptions} />
	</section>
};
