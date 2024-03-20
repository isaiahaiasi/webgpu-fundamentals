import { DatGui } from "./DatGui";
import { GPUCanvas } from "./GPUCanvas";

interface WebGPUSampleProps {
	canvasOptions: Partial<CanvasDisplayOptions>;
	demo: WebGPUDemo;
}

export function WebGPUSample({ demo, canvasOptions }: WebGPUSampleProps) {
	const { settingsGui } = demo;

	return <section>
		<h2>{demo.title}</h2>
		<p>{demo.description}</p>
		{settingsGui && !canvasOptions.hideSettings && <DatGui gui={settingsGui} />}
		<GPUCanvas demo={demo} options={canvasOptions} />
	</section>
};
