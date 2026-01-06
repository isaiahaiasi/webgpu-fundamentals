import Stats from "stats.js";
import { setCanvasDisplayOptions } from "../../../utils/canvas_utils";
import { handleRenderLoop, initWebGPU } from "../../../utils/wgpu_utils";
import shaderCode from "./shader.wgsl?raw";

const gameOptions = {
	workGroupSize: 16, // Options: 4, 8, 16
	boardWidth: 256,
	boardHeight: 256,
	minFrameTime: .1, // minimum frame time in seconds
	aliveCol: [255 * .35, 255 * .85, 255], // RGB for alive cells
	deadCol: [255 * 0.15, 0, 255 * 0.25], // RGB for dead cells
	isPaused: false,
};

// Previous gui needs to be destroyed before creating a new one.
// We keep a reference here rather than passing it around.
let gui = null as dat.GUI | null;

async function initGui(
	parent: HTMLElement,
	restartCb: () => void,
	colorUpdateCb: (cols: { aliveCol: number[], deadCol: number[] }) => void
) {
	// dat.gui assumes DOM is available, so we import it dynamically to avoid
	// issues with Astro SSG attempting to process at build time.
	const dat = await import('dat.gui');

	if (gui) {
		parent.removeChild(gui.domElement);
		gui.destroy();
	}

	gui = new dat.GUI({ name: 'life::gui', autoPlace: false });
	parent.appendChild(gui.domElement);
	gui.domElement.id = "life-gui";
	gui.domElement.style.position = "absolute";
	gui.domElement.style.top = "0";
	gui.domElement.style.right = "0";

	// Controls that require a full reset
	gui.add(gameOptions, "workGroupSize", [4, 8, 16])
		.name("WorkGroupSize")
		.onFinishChange(() => {
			restartCb();
		});
	gui.add(gameOptions, "boardWidth", 32, 2048, 1)
		.name("BoardWidth")
		.onFinishChange(() => {
			restartCb();
		});
	gui.add(gameOptions, "boardHeight", 32, 2048, 1)
		.name("BoardHeight")
		.onFinishChange(() => {
			restartCb();
		});

	// Controls that can update live
	gui.add(gameOptions, "minFrameTime", 0, 1, 0.01)
		.name("MinFrameTime");
	gui.addColor(gameOptions, "aliveCol")
		.name("Alive Color")
		.onChange(() => {
			colorUpdateCb({ aliveCol: gameOptions.aliveCol, deadCol: gameOptions.deadCol });
		});
	gui.addColor(gameOptions, "deadCol").name("Dead Color")
		.onChange(() => {
			colorUpdateCb({ aliveCol: gameOptions.aliveCol, deadCol: gameOptions.deadCol });
		});
}

async function initRender(
	device: GPUDevice, context: GPUCanvasContext
) {
	const boardAspect = gameOptions.boardWidth / gameOptions.boardHeight;
	const canvasAspect = context.canvas.width / context.canvas.height;
	const scaleX = canvasAspect > boardAspect ? (boardAspect / canvasAspect) : 1;
	const scaleY = canvasAspect > boardAspect ? 1 : (canvasAspect / boardAspect);

	const shaderModule = device.createShaderModule({
		label: 'life::module::shader',
		// Changing these constants requires a full reset of the pipeline,
		// so there's no benefit in passing them in as uniforms.
		code: `
const BoardWidth : u32 = ${gameOptions.boardWidth}u;
const BoardHeight : u32 = ${gameOptions.boardHeight}u;
const ScaleX : f32 = ${scaleX};
const ScaleY : f32 = ${scaleY};
const WorkGroupSize : u32 = ${gameOptions.workGroupSize}u;
` + shaderCode,
	});

	// Create two "ping pong" buffers
	const cellTextures = ['ping', 'pong'].map(p => device.createTexture({
			label: `life::texture::cells::${p}`,
			size: [gameOptions.boardWidth, gameOptions.boardHeight],
			format: 'r32uint',
			usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
		}));

	{
		// Create initial random state on the CPU
		const initState = new Uint32Array(
			gameOptions.boardWidth * gameOptions.boardHeight
		);

		for (let i = 0; i < initState.length; i++) {
			initState[i] = Math.random() > 0.8 ? 1 : 0;
		}

		// Copy initial state to first ping pong buffer
		device.queue.writeTexture(
			{texture: cellTextures[0]},
			initState,
			{ bytesPerRow: gameOptions.boardWidth * 4 },
			[gameOptions.boardWidth, gameOptions.boardHeight],
		);
	}

	const colorBufferValues = new Float32Array([
		...gameOptions.aliveCol.map(c => c / 255), 0,
		...gameOptions.deadCol.map(c => c / 255), 0,
	]);

	const colorBuffer = device.createBuffer({
		label: 'life::uniform::colors',
		size: colorBufferValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(colorBuffer, 0, colorBufferValues);

	const computePipeline = device.createComputePipeline({
		label: "life::pipeline::compute",
		layout: 'auto',
		compute: { module: shaderModule, entryPoint: 'main'},
	});

	const renderPipeline = device.createRenderPipeline({
		label: 'life::pipeline::render',
		layout: 'auto',
		vertex: { module: shaderModule, entryPoint: 'vs' },
		fragment: {
			module: shaderModule,
			entryPoint: 'fs',
			targets: [{ format: context.getCurrentTexture().format }],
		},
		primitive: { topology: 'triangle-list' },
	});

	const computeBindGroups = [
		device.createBindGroup({
			label: 'life::bindgroup::compute::ping',
			layout: computePipeline.getBindGroupLayout(1),
			entries: [
				{ binding: 0, resource: cellTextures[0].createView() },
				{ binding: 1, resource: cellTextures[1].createView() },
			]
		}),
		device.createBindGroup({
			label: 'life::bindgroup::compute::pong',
			layout: computePipeline.getBindGroupLayout(1),
			entries: [
				{ binding: 0, resource: cellTextures[1].createView() },
				{ binding: 1, resource: cellTextures[0].createView() },
			]
		}),
	];

	const renderBindGroups = [
		device.createBindGroup({
			label: 'life::bindgroup::render::ping',
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: cellTextures[0].createView() },
				{ binding: 1, resource: { buffer: colorBuffer } },
			],
		}),
		device.createBindGroup({
			label: 'life::bindgroup::render::pong',
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: cellTextures[1].createView() },
				{ binding: 1, resource: { buffer: colorBuffer } },
			],
		}),
	];

	const renderPassDesc: GPURenderPassDescriptor = {
		label: 'life::renderpass',
		colorAttachments: [{
			view: undefined, // Assigned at render time
			loadOp: 'clear',
			storeOp: 'store',
			clearValue: [0, 0, 0, 1], // black
		}],
	};

	let pingPongIndex = 0;
	let timeSinceLastRender = gameOptions.minFrameTime;

	let stopped = false;
	// restart function passed to GUI to recreate this whole initRender without page reload
	const restart = async () => {
		// set stopped so the active render loop exits quickly
		stopped = true;
		// small microtask yield to ensure loop sees stopped flag
		await new Promise(resolve => setTimeout(resolve, 0));
		// create a fresh render setup
		await initRender(device, context);
	};

	const updateColors = (
		{ aliveCol, deadCol }: { aliveCol: number[], deadCol: number[], }
	) => {
		// update GPU uniform buffer with new colors
		[
			...aliveCol,
			0,
			...deadCol,
			0,
		].forEach((v, i) => colorBufferValues[i] = v / 255);
		device.queue.writeBuffer(colorBuffer, 0, colorBufferValues);
	}

	// Stats + GUI setup (uses canvas parent)
	const parent = (context.canvas as HTMLCanvasElement).parentElement;
	let stats: Stats | null = null;
	if (parent) {
		document.getElementById("life-stats")?.remove();
		stats = new Stats();
		stats.showPanel(0);
		stats.dom.style.position = "absolute";
		stats.dom.id = "life-stats";
		parent.appendChild(stats.dom);
		await initGui(parent, restart, updateColors);
	}

	handleRenderLoop(async ({ deltaTime }) => {
		if (stopped) {
			return true;
		}

		if (stats) {
			stats.update();
		}

		// Only render at fixed minimum frame time & not paused.
		{
			if (gameOptions.isPaused) {
				return;
			}

			timeSinceLastRender += deltaTime;
			if (timeSinceLastRender < gameOptions.minFrameTime) {
				return;
			}
			timeSinceLastRender = 0;
		}

		const encoder = device.createCommandEncoder({ label: 'life::encoder' });

		// Compute pass
		const computePass = encoder.beginComputePass();
		computePass.setPipeline(computePipeline);
		computePass.setBindGroup(1, computeBindGroups[pingPongIndex]);
		computePass.dispatchWorkgroups(
			Math.ceil(gameOptions.boardWidth / gameOptions.workGroupSize),
			Math.ceil(gameOptions.boardHeight / gameOptions.workGroupSize)
		);
		computePass.end();

		// Render pass
		renderPassDesc.colorAttachments[0].view =
			context.getCurrentTexture().createView();

		const renderPass = encoder.beginRenderPass(renderPassDesc);
		renderPass.setPipeline(renderPipeline);
		renderPass.setBindGroup(0, renderBindGroups[pingPongIndex])
		renderPass.draw(6); // (calls vertex shader 4 times)
		renderPass.end();

		device.queue.submit([encoder.finish()]);

		// Swap ping pong index for next frame
		pingPongIndex = (pingPongIndex + 1) % 2;
	});
}

export async function main(canvasId: string) {
	const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;

	if (!canvas) {
		console.error(`Could not find canvas with id: ${canvasId}`);
		return;
	}

	const initResult = await initWebGPU(canvas);

	if (!initResult) {
		return;
	}

	setCanvasDisplayOptions(
		canvas,
		{
			imageRendering: "auto",
			onClick: () => {
				gameOptions.isPaused = !gameOptions.isPaused;
				canvas.classList.toggle('paused');
			},
		});

	const [device, context] = initResult;

	initRender(device, context);
}
