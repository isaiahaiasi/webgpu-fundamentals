import { createGPUSampleSection } from "../utils/DOMHelpers";
import { getGPUDevice } from "../utils/wgpu-utils";
import computeShaderCode from "./shaders/compute.wgsl?raw";
import vertShaderCode from "./shaders/vert.wgsl?raw";
import fragShaderCode from "./shaders/frag.wgsl?raw";
import { setCanvasDisplayOptions } from "../utils/canvasHelpers";

const gameSettings = {
	width: 32,
	height: 32,
	timestep: 32,
	workgroupSize: 8,
};

async function main(canvas: HTMLCanvasElement) {
	const device = await getGPUDevice();

	if (!device) {
		console.error("could not get device");
		return;
	}

	const context = canvas.getContext("webgpu");

	if (!context) {
		console.error("Could not get webgpu canvas context");
		return;
	}

	setCanvasDisplayOptions(canvas);

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: "premultiplied" });

	const computeShader = device.createShaderModule({ code: computeShaderCode });
	const bindGroupLayoutCompute = device.createBindGroupLayout({
		entries: [
			{
				binding: 0,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'read-only-storage',
				},
			},
			{
				binding: 1,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'read-only-storage',
				},
			},
			{
				binding: 2,
				visibility: GPUShaderStage.COMPUTE,
				buffer: {
					type: 'storage',
				},
			},
		],
	});

	const squareVertices = new Uint32Array([0, 0, 0, 1, 1, 0, 1, 1]);
	const squareBuffer = device.createBuffer({
		size: squareVertices.byteLength,
		usage: GPUBufferUsage.VERTEX,
		mappedAtCreation: true,
	});
	new Uint32Array(squareBuffer.getMappedRange()).set(squareVertices);
	squareBuffer.unmap();

	const squareStride: GPUVertexBufferLayout = {
		arrayStride: 2 * squareVertices.BYTES_PER_ELEMENT,
		stepMode: 'vertex',
		attributes: [
			{
				shaderLocation: 1,
				offset: 0,
				format: 'uint32x2',
			},
		],
	};

	const vertexShader = device.createShaderModule({ code: vertShaderCode });
	const fragmentShader = device.createShaderModule({ code: fragShaderCode });
	let commandEncoder: GPUCommandEncoder;

	const bindGroupLayoutRender = device.createBindGroupLayout({
		entries: [
			{
				// size
				binding: 0,
				visibility: GPUShaderStage.VERTEX,
				buffer: {
					type: 'uniform',
				},
			},
		],
	});

	const cellsStride: GPUVertexBufferLayout = {
		arrayStride: Uint32Array.BYTES_PER_ELEMENT,
		stepMode: 'instance',
		attributes: [
			{
				shaderLocation: 0,
				offset: 0,
				format: 'uint32',
			},
		],
	};

	let wholeTime = 0,
		loopTimes = 0,
		buffer0: GPUBuffer,
		buffer1: GPUBuffer;

	function resetGameData() {
		if (!device || !context) {
			throw new Error("Bad call");
		}

		// compute pipeline
		const computePipeline = device.createComputePipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [bindGroupLayoutCompute],
			}),
			compute: {
				module: computeShader,
				entryPoint: 'cs',
				constants: {
					blockSize: gameSettings.workgroupSize,
				},
			},
		});
		const sizeBuffer = device.createBuffer({
			size: 2 * Uint32Array.BYTES_PER_ELEMENT,
			usage:
				GPUBufferUsage.STORAGE |
				GPUBufferUsage.UNIFORM |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.VERTEX,
			mappedAtCreation: true,
		});
		new Uint32Array(sizeBuffer.getMappedRange()).set([
			gameSettings.width,
			gameSettings.height,
		]);
		sizeBuffer.unmap();

		const length = gameSettings.width * gameSettings.height;
		const cells = new Uint32Array(length);
		for (let i = 0; i < length; i++) {
			cells[i] = Math.random() < 0.25 ? 1 : 0;
		}

		buffer0 = device.createBuffer({
			size: cells.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
			mappedAtCreation: true,
		});


		buffer1 = device.createBuffer({
			size: cells.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
		});

		new Uint32Array(buffer0.getMappedRange()).set(cells);
		buffer0.unmap();

		const bindGroup0 = device.createBindGroup({
			layout: bindGroupLayoutCompute,
			entries: [
				{ binding: 0, resource: { buffer: sizeBuffer } },
				{ binding: 1, resource: { buffer: buffer0 } },
				{ binding: 2, resource: { buffer: buffer1 } },
			],
		});

		const bindGroup1 = device.createBindGroup({
			layout: bindGroupLayoutCompute,
			entries: [
				{ binding: 0, resource: { buffer: sizeBuffer } },
				{ binding: 1, resource: { buffer: buffer1 } },
				{ binding: 2, resource: { buffer: buffer0 } },
			],
		});

		const renderPipeline = device.createRenderPipeline({
			layout: device.createPipelineLayout({
				bindGroupLayouts: [bindGroupLayoutRender],
			}),
			primitive: {
				topology: 'triangle-strip',
			},
			vertex: {
				module: vertexShader,
				entryPoint: 'vs',
				buffers: [cellsStride, squareStride],
			},
			fragment: {
				module: fragmentShader,
				entryPoint: 'fs',
				targets: [{ format }],
			},
		});

		const uniformBindGroup = device.createBindGroup({
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: sizeBuffer,
						offset: 0,
						size: 2 * Uint32Array.BYTES_PER_ELEMENT,
					},
				},
			],
		});

		loopTimes = 0;

		function render() {
			if (!context || !device) {
				throw new Error("Bad call!");
			}

			const view = context.getCurrentTexture().createView();
			const renderPass: GPURenderPassDescriptor = {
				colorAttachments: [
					{
						view,
						loadOp: 'clear',
						storeOp: 'store',
					},
				],
			};
			commandEncoder = device.createCommandEncoder();

			// compute
			const passEncoderCompute = commandEncoder.beginComputePass();
			passEncoderCompute.setPipeline(computePipeline);
			passEncoderCompute.setBindGroup(0, loopTimes ? bindGroup1 : bindGroup0);
			passEncoderCompute.dispatchWorkgroups(
				gameSettings.width / gameSettings.workgroupSize,
				gameSettings.height / gameSettings.workgroupSize
			);
			passEncoderCompute.end();
			// render
			const passEncoderRender = commandEncoder.beginRenderPass(renderPass);
			passEncoderRender.setPipeline(renderPipeline);
			passEncoderRender.setVertexBuffer(0, loopTimes ? buffer1 : buffer0);
			passEncoderRender.setVertexBuffer(1, squareBuffer);
			passEncoderRender.setBindGroup(0, uniformBindGroup);
			passEncoderRender.draw(4, length);
			passEncoderRender.end();

			device.queue.submit([commandEncoder.finish()]);
		}

		return render;
	}

	const render = resetGameData();

	(function loop() {
		if (gameSettings.timestep) {
			wholeTime++;
			if (wholeTime >= gameSettings.timestep) {
				render();
				wholeTime -= gameSettings.timestep;
				loopTimes = 1 - loopTimes;
			}
		}

		requestAnimationFrame(loop);
	})();
}

export default createGPUSampleSection({
	title: "05_game_of_life",
	description: "A compute-shader version of Game of Life, based on https://github.com/webgpu/webgpu-samples",
	initFn: main,
});