type CSSRelativeAssignmentValues =
	"inherit" |
	"initial" |
	"revert" |
	"revert-layer" |
	"unset";

interface CanvasRisizeObserverOptions {
	render?: () => void;
	useDevicePixelRatio: boolean;
	customPixelScale: number;
	imageRendering: "auto" | "crisp-edges" | "pixelated" | "smooth" | "high-quality" | CSSRelativeAssignmentValues;
}

const defaultCanvasResizeObserverOptions: CanvasRisizeObserverOptions = {
	useDevicePixelRatio: true,
	customPixelScale: 1,
	imageRendering: "auto",
};

export function observeResizableCanvas(
	canvas: HTMLCanvasElement,
	device: GPUDevice,
	options: Partial<CanvasRisizeObserverOptions> = {}) {
	const {
		render,
		useDevicePixelRatio,
		customPixelScale,
		imageRendering
	} = { ...defaultCanvasResizeObserverOptions, ...options };

	const observer = new ResizeObserver(entries => {
		for (const entry of entries) {
			const canvas = entry.target as HTMLCanvasElement;
			canvas.style.imageRendering = imageRendering;

			const width = entry.contentBoxSize[0].inlineSize | 0;
			const height = entry.contentBoxSize[0].blockSize | 0;
			const devicePixelRatio = (useDevicePixelRatio && window.devicePixelRatio) || 1;

			canvas.width = Math.min(width * devicePixelRatio * customPixelScale, device.limits.maxTextureDimension2D);
			canvas.height = Math.min(height * devicePixelRatio * customPixelScale, device.limits.maxTextureDimension2D);

			if (render) {
				render();
			}
		}
	});

	observer.observe(canvas);
	return observer;
}
