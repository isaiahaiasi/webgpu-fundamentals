import { useRef, useEffect } from "preact/hooks";

interface GPUSampleSectionInfo {
	title: string;
	description: string;
	initFn: (canvas: HTMLCanvasElement) => void;
}

export function WebGPUSample({ title, description, initFn }: GPUSampleSectionInfo) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		if (ref.current) {
			initFn(ref.current);
		}
	}, [ref.current]);

	return <section>
		<h2>{title}</h2>
		<p>{description}</p>
		<div className="gpu-example-container">
			<canvas className="gpu-example" ref={ref} />
		</div>
	</section>
};
