type CSSRelativeAssignmentValues =
	"inherit" |
	"initial" |
	"revert" |
	"revert-layer" |
	"unset"

type RenderCB = (time: RenderTimeInfo) => void;
type InitCB = (device: GPUDevice, context: GPUCanvasContext) => Promise<RenderCB>;

interface GPUSampleSectionInfo {
	title: string;
	description: string;
	init: InitCB;
};

interface CanvasDisplayOptions {
	useDevicePixelRatio: boolean;
	customPixelScale: number;
	imageRendering: "auto" | "crisp-edges" | "pixelated" | "smooth" | "high-quality" | CSSRelativeAssignmentValues;
	maxSize: number;
	width?: number;
	height?: number;
	showStats: boolean;
}
