type CSSRelativeAssignmentValues =
	"inherit" |
	"initial" |
	"revert" |
	"revert-layer" |
	"unset"

type WebGPUDemoFactory = () => WebGPUDemo;
type RenderCB = (time: RenderTimeInfo) => void;

interface WebGPUDemo {
	title: string;
	description: string;
	init: (device: GPUDevice, context: GPUCanvasContext) => Promise<RenderCB>;
	/** Get a dat.GUI object that can manipulate attributes of the Demo. */
	settingsGui?: dat.GUI;
};

interface CanvasDisplayOptions {
	useDevicePixelRatio: boolean;
	customPixelScale: number;
	imageRendering: "auto" | "crisp-edges" | "pixelated" | "smooth" | "high-quality" | CSSRelativeAssignmentValues;
	maxSize: number;
	width?: number;
	height?: number;
	showStats: boolean;
	hideSettings: boolean;
}
