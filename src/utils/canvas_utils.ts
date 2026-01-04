type CSSRelativeAssignmentValues =
	"inherit" |
	"initial" |
	"revert" |
	"revert-layer" |
	"unset";


interface CanvasDisplayOptions {
	render?: () => void;
	useDevicePixelRatio: boolean;
	customPixelScale: number;
	imageRendering: "auto" | "crisp-edges" | "pixelated" | "smooth" | "high-quality" | CSSRelativeAssignmentValues;
	maxSize: number;
	width?: number;
	height?: number;
	onClick?: EventListener;
}

const defaultCanvasDisplayOptions: CanvasDisplayOptions = {
	useDevicePixelRatio: true,
	customPixelScale: 1,
	imageRendering: "auto",
	maxSize: Infinity,
};

export function setCanvasDisplayOptions(
	canvas: HTMLCanvasElement,
	options: Partial<CanvasDisplayOptions> = {}) {
	let {
		useDevicePixelRatio,
		customPixelScale,
		imageRendering,
		width,
		height,
		maxSize,
		onClick,
	} = { ...defaultCanvasDisplayOptions, ...options };
	canvas.style.imageRendering = imageRendering;

	if (!width) {
		width = canvas.clientWidth;
	}
	if (!height) {
		height = canvas.clientHeight;
	}

	if (onClick) {
		canvas.addEventListener("click", onClick);
	}

	const devicePixelRatio = (useDevicePixelRatio && window.devicePixelRatio) || 1;
	canvas.width = Math.min(width * devicePixelRatio * customPixelScale, maxSize);
	canvas.height = Math.min(height * devicePixelRatio * customPixelScale, maxSize);
}


export function observeResizableCanvas(
	canvas: HTMLCanvasElement,
	device: GPUDevice,
	options: Omit<Partial<CanvasDisplayOptions>, "width" | "height"> = {}) {
	const observer = new ResizeObserver(entries => {
		for (const entry of entries) {
			const canvas = entry.target as HTMLCanvasElement;
			const width = entry.contentBoxSize[0].inlineSize | 0;
			const height = entry.contentBoxSize[0].blockSize | 0;

			const maxSize = options.maxSize
				? Math.min(device.limits.maxTextureDimension2D, options.maxSize)
				: device.limits.maxTextureDimension2D;

			setCanvasDisplayOptions(
				canvas,
				{ ...options, width, height, maxSize }
			);
		}
	});

	observer.observe(canvas);
	return observer;
}
