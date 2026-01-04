import { setCanvasDisplayOptions } from "../../../utils/canvas_utils";
import { handleRenderLoop, initWebGPU } from "../../../utils/wgpu_utils";

import shaderCode from './shader.wgsl?raw';

const gameOptions = {
	workGroupSize: 8, // Options: 4, 8. 16
	boardWidth: 128, // Must be divisible by 16 for max workgroup size.
	boardHeight: 128, // Must be divisible by 16 for max workgroup size.
};



async function initRender(
	device: GPUDevice, context: GPUCanvasContext
): Promise<() => void> {
	const shaderModule = device.createShaderModule({
		label: 'test::module::shader',
		code: shaderCode,
	});

	const computeBindGroupLayout = device.createBindGroupLayout({
		label: 'life::bglayout::compute',
		entries: [
			{
				binding: 0,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: 'read-only-storage' }
			},
			{
				binding: 1,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: 'read-only-storage' }
			},
		],
	});

	const bufferSize = gameOptions.boardWidth * gameOptions.boardHeight * 4;

	// Create two "ping pong" buffers
	const pingPongBuffers = [
		device.createBuffer({
			label: 'life::buffer::ping',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		}),
		device.createBuffer({
			label: 'life::buffer::pong',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		}),
	];

	{
		// Create initial random state on the CPU
		const initialState = new Uint32Array(
			gameOptions.boardWidth * gameOptions.boardHeight
		);

		for (let i = 0; i < initialState.length; i++) {
			initialState[i] = Math.random() > 0.25 ? 1 : 0;
		}

		// Copy initial state to first ping pong buffer
		device.queue.writeBuffer(pingPongBuffers[0], 0, initialState.buffer);
		console.log(initialState);
	}


	const computePipeline = device.createComputePipeline({
		label: "life::pipeline::compute",
		layout: device.createPipelineLayout({
			bindGroupLayouts: [computeBindGroupLayout]
		}),
		compute: {
			module: shaderModule,
			entryPoint: 'main',
		},
	});

	const renderPipeline = device.createRenderPipeline({
		label: 'life::pipeline::render',
		layout: 'auto',
		vertex: {
			module: shaderModule,
			buffers: [{
				arrayStride: 2 * 4,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: 'float32x2' },
				],
			}],
		},
		fragment: {
			module: shaderModule,
			targets: [{ format: context.getCurrentTexture().format }],
		},
		primitive: { topology: 'triangle-strip' },
	});

	const computeBindGroups = [
		device.createBindGroup({
			label: 'life::bindgroup::compute::ping',
			layout: computePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: pingPongBuffers[0] } },
				{ binding: 1, resource: { buffer: pingPongBuffers[1] } },
			]
		}),
		device.createBindGroup({
			label: 'life::bindgroup::compute::pong',
			layout: computePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: pingPongBuffers[1] } },
				{ binding: 1, resource: { buffer: pingPongBuffers[0] } },
			]
		}),
	];

	const renderBindGroups = [
		device.createBindGroup({
			label: 'life::bindgroup::render::ping',
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: pingPongBuffers[0] } },
			],
		}),
		device.createBindGroup({
			label: 'life::bindgroup::render::pong',
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: pingPongBuffers[1] } },
			],
		}),
	];

	const vertices = new Float32Array([
		-1.0, -1.0,
		1.0, -1.0,
		-1.0, 1.0,
		1.0, 1.0,
	]);

	const vertexBuffer = device.createBuffer({
		label: 'life::buffer::vertices',
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(vertexBuffer, 0, vertices.buffer);

	const renderPassDesc: GPURenderPassDescriptor = {
		label: 'life::renderpass',
		colorAttachments: [{
			view: undefined, // Assigned at render time
			loadOp: 'clear',
			storeOp: 'store',
			clearValue: [1, 0, 1, 1],
		}],
	};

	let pingPongIndex = 0;
	const render = () => {
    const encoder = device.createCommandEncoder({ label: 'life::encoder'});

		// Compute pass
		// const computePass = encoder.beginComputePass();
		// computePass.setPipeline(computePipeline);
		// computePass.setBindGroup(0, computeBindGroups[pingPongIndex]);
		// computePass.dispatchWorkgroups(
		// 	gameOptions.boardWidth / gameOptions.workGroupSize,
		// 	gameOptions.boardHeight / gameOptions.workGroupSize
		// );
		// computePass.end();

		// Render pass

		renderPassDesc.colorAttachments[0].view =
			context.getCurrentTexture().createView();

		const pass = encoder.beginRenderPass(renderPassDesc);
		pass.setPipeline(renderPipeline);
		pass.setVertexBuffer(0, vertexBuffer);
		pass.setBindGroup(0, renderBindGroups[pingPongIndex])
		pass.draw(4); // (calls vertex shader 4 times)
		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);

		// Swap ping pong index for next frame
		pingPongIndex = (pingPongIndex + 1) % 2;
	}

	return render;
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

	setCanvasDisplayOptions(canvas, {imageRendering: "auto"});

	const [device, context] = initResult;

	const render = await initRender(device, context);

	render();

	// handleRenderLoop(render)
}
