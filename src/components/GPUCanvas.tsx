import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { getGPUDevice, handleRenderLoop } from "../utils/wgpu-utils";
import Stats from "stats.js";
import { StatsRenderer } from "./StatsRenderer";

interface GPUCanvasProps {
	options?: Partial<CanvasDisplayOptions>;
	demo: WebGPUDemo;
}

const defaultCanvasDisplayOptions: CanvasDisplayOptions = {
	useDevicePixelRatio: true,
	customPixelScale: 1,
	imageRendering: "auto",
	maxSize: Infinity,
	showStats: false,
	hideSettings: false,
};

function setCanvasDisplayOptions(
	canvas: HTMLCanvasElement,
	options: Partial<CanvasDisplayOptions>
) {
	const {
		useDevicePixelRatio,
		customPixelScale,
		imageRendering,
		maxSize,
	} = { ...defaultCanvasDisplayOptions, ...options };

	let { width, height } = options;

	canvas.style.imageRendering = imageRendering;

	if (!width) {
		width = canvas.clientWidth;
	}
	if (!height) {
		height = canvas.clientHeight;
	}

	const devicePixelRatio = (useDevicePixelRatio && window.devicePixelRatio) || 1;
	canvas.width = Math.min(width * devicePixelRatio * customPixelScale, maxSize);
	canvas.height = Math.min(height * devicePixelRatio * customPixelScale, maxSize);
}

export function GPUCanvas({ options = {}, demo }: GPUCanvasProps) {
	const { init } = demo;
	const ref = useRef<HTMLCanvasElement | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const stats = useMemo(() => new Stats(), []);

	// TODO: Extract as much of this out as possible.
	useEffect(() => {
		if (!ref.current) {
			return;
		}

		let device: GPUDevice | null = null;
		let killLoop: (() => void) | null = null;

		(async (canvas: HTMLCanvasElement) => {
			device = await getGPUDevice();
			if (!device) {
				const err = "Could not get GPU device.";
				setErr(err);
				console.error(err);
				return;
			}

			const context = canvas.getContext("webgpu");
			if (!context) {
				const err = "Could not get webGPU canvas context"
				setErr(err);
				console.error(err);
				return;
			}

			setCanvasDisplayOptions(canvas, options);

			const render = await init(device, context);

			killLoop = handleRenderLoop(render, { stats });
		})(ref.current);

		return () => {
			device?.destroy();
			if (killLoop) {
				killLoop();
			}
		};

	}, [init, setErr, options]);

	return err
		? <div style={{ background: "orange", color: "darkred" }}>{err}</div>
		: <div class="gpu-example-container">
			<canvas ref={ref} class="gpu-example" />
			{options.showStats && <StatsRenderer stats={stats} />}
		</div>;
}
