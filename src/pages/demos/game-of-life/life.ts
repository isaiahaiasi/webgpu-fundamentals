import { setCanvasDisplayOptions } from "../../../utils/canvas_utils";
import { handleRenderLoop, initWebGPU } from "../../../utils/wgpu_utils";

// TODO:
// - Preserve aspect ratio.
// - Add UI to change options.
// - Handle resizing.
// - Handle pausing.

const gameOptions = {
	workGroupSize: 16, // Options: 4, 8. 16
	boardWidth: 1024,
	boardHeight: 512,
	minFrameTime: .1, // minimum frame time in seconds
	aliveCol: [.35, .85, 1], // RGB for alive cells
	deadCol: [0.0, 0.0, 0.0], // RGB for dead cells
};

async function initRender(
	device: GPUDevice, context: GPUCanvasContext
) {
	const shaderModule = device.createShaderModule({
		label: 'test::module::shader',
		code: `struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) fragCoord: vec2f
};

@group(0) @binding(0) var<storage, read> readBuffer : array<u32>;
@group(0) @binding(1) var<storage, read_write> writeBuffer : array<u32>;

@vertex
fn vs(@location(0) inPos : vec2f) -> VSOut {
    var out : VSOut;
    out.pos = vec4f(inPos, 0.0, 1.0);
    out.fragCoord = inPos * 0.5 + 0.5;
    return out;
}

const BoardWidth : u32 = ${gameOptions.boardWidth}u;
const BoardHeight : u32 = ${gameOptions.boardHeight}u;

@fragment
fn fs(@location(0) pos : vec2f) -> @location(0) vec4f {
    let index = vec2u(u32(pos.x * f32(BoardWidth)), u32(pos.y * f32(BoardHeight)));
    let value = readBuffer[index.y * BoardWidth + index.x];
    if (value == 1u) {
        return vec4f(${gameOptions.aliveCol}, 1.0);
    } else {
        return vec4f(${gameOptions.deadCol}, 1.0);
    }
}

@compute @workgroup_size(
    ${gameOptions.workGroupSize},
    ${gameOptions.workGroupSize},
    1
) fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let idx = id.y * BoardWidth + id.x;
    var neighborCount : u32 = 0u;

    for (var y: i32 = -1; y <= 1; y+= 1) {
        for (var x: i32 = -1; x <= 1; x+= 1) {
            if (x == 0 && y == 0) {
                continue;
            }
            let neighborY = (i32(id.y) + y + i32(BoardHeight)) % i32(BoardHeight);
            let neighborX = (i32(id.x) + x + i32(BoardWidth)) % i32(BoardWidth);
            let neighborIdx = u32(neighborY) * BoardWidth + u32(neighborX);
            neighborCount += readBuffer[neighborIdx];
        }
    }

    if (neighborCount == 3u) {
        writeBuffer[idx] = 1u;
    } else if (neighborCount == 2u) {
        writeBuffer[idx] = readBuffer[idx];
    } else {
        writeBuffer[idx] = 0u;
    }
}
`,
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
			initialState[i] = Math.random() > 0.5 ? 0 : 1;
		}

		// Copy initial state to first ping pong buffer
		device.queue.writeBuffer(pingPongBuffers[0], 0, initialState.buffer);
	}


	const computePipeline = device.createComputePipeline({
		label: "life::pipeline::compute",
		layout: 'auto',
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
			entryPoint: 'vs',
			buffers: [{
				arrayStride: 2 * 4,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: 'float32x2' },
				],
			}],
		},
		fragment: {
			module: shaderModule,
			entryPoint: 'fs',
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

	// Basic square to render to.
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

	let timeSinceLastRender = gameOptions.minFrameTime;
	let pingPongIndex = 0;

	handleRenderLoop(({ deltaTime }) => {
		timeSinceLastRender += deltaTime;
		if (timeSinceLastRender < gameOptions.minFrameTime) {
			return;
		}

		timeSinceLastRender = 0;

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
