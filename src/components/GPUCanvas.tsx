import {useState, useRef, useEffect, useMemo} from "preact/hooks";
import {getGPUDevice, handleRenderLoop} from "../utils/wgpu-utils";
import Stats from "stats.js";
import {StatsRenderer} from "./StatsRenderer";

interface GPUCanvasProps {
	options?: Partial<CanvasDisplayOptions>;
	init: InitCB;
}

const defaultCanvasDisplayOptions: CanvasDisplayOptions = {
	useDevicePixelRatio: true,
	customPixelScale: 1,
	imageRendering: "auto",
	maxSize: Infinity,
	showStats: false,
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
	} = {...defaultCanvasDisplayOptions, ...options};

	let {width, height} = options;

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

export function GPUCanvas({options = {}, init}: GPUCanvasProps) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const stats = useMemo(() => new Stats(), []);

	useEffect(() => {
		if (!ref.current) {
			return;
		}

		let killLoop: (() => void) | null = null;

		(async (canvas: HTMLCanvasElement) => {
			const device = await getGPUDevice();
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

			killLoop = handleRenderLoop(render, {stats});
		})(ref.current);

		return () => {
			if (killLoop) {
				killLoop();
			}
		};

	}, []);

	return err
		? <div style={{background: "orange", color: "darkred"}}>{err}</div>
		: <div className="gpu-example-container">
			<canvas ref={ref} className="gpu-example" />
			{options.showStats && <StatsRenderer stats={stats} />}
		</div>;
}
