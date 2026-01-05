import { setCanvasDisplayOptions } from "../../../utils/canvas_utils";
import { handleRenderLoop, initWebGPU } from "../../../utils/wgpu_utils";
import shaderCode from "./shader.wgsl?raw";

const gameOptions = {
	workGroupSize: 16, // Options: 4, 8, 16
	boardWidth: 256,
	boardHeight: 256,
	minFrameTime: .1, // minimum frame time in seconds
	aliveCol: [.35, .85, 1], // RGB for alive cells
	deadCol: [0.15, 0.0, 0.25], // RGB for dead cells
};

async function initRender(
	device: GPUDevice, context: GPUCanvasContext
) {
	const boardAspect = gameOptions.boardWidth / gameOptions.boardHeight;
	const canvasAspect = context.canvas.width / context.canvas.height;
	const scaleX = canvasAspect > boardAspect ? (boardAspect / canvasAspect) : 1;
	const scaleY = canvasAspect > boardAspect ? 1 : (canvasAspect / boardAspect);;

	const shaderModule = device.createShaderModule({
		label: 'life::module::shader',
		code: `
const BoardWidth : u32 = ${gameOptions.boardWidth}u;
const BoardHeight : u32 = ${gameOptions.boardHeight}u;
const ScaleX : f32 = ${scaleX};
const ScaleY : f32 = ${scaleY};
const AliveCol : vec3f = vec3f(${gameOptions.aliveCol});
const DeadCol : vec3f = vec3f(${gameOptions.deadCol});
const WorkGroupSize : u32 = ${gameOptions.workGroupSize}u;
` + shaderCode,
	});

	const bufferSize = gameOptions.boardWidth * gameOptions.boardHeight * 4;

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
			initState[i] = Math.random() > 0.5 ? 0 : 1;
		}

		// Copy initial state to first ping pong buffer
		device.queue.writeTexture(
			{texture: cellTextures[0]},
			initState,
			{ bytesPerRow: gameOptions.boardWidth * 4 },
			[gameOptions.boardWidth, gameOptions.boardHeight],
		);
	}


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
			layout: computePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: cellTextures[0].createView() },
				{ binding: 1, resource: cellTextures[1].createView() },
			]
		}),
		device.createBindGroup({
			label: 'life::bindgroup::compute::pong',
			layout: computePipeline.getBindGroupLayout(0),
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
			],
		}),
		device.createBindGroup({
			label: 'life::bindgroup::render::pong',
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: cellTextures[1].createView() },
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

	handleRenderLoop(({ deltaTime }) => {
		{
			// Only render at fixed minimum frame time.
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
		computePass.setBindGroup(0, computeBindGroups[pingPongIndex]);
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

	setCanvasDisplayOptions(canvas, { imageRendering: "auto" });

	const [device, context] = initResult;

	initRender(device, context);
}
