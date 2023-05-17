import { createGPUSampleSection } from "../utils/DOMHelpers";
import { setCanvasDisplayOptions } from "../utils/canvasHelpers";
import { getGPUDevice } from "../utils/wgpu-utils";

import renderShaderCode from "./render.wgsl?raw";
import computeShaderCode from "./compute.wgsl?raw";

const simOptions = {
	moveSpeed: 50,
	numAgents: 16,
	texWidth: 526,
	texHeight: 256,
}

async function init(canvas: HTMLCanvasElement) {
	const device = await getGPUDevice();
	if (!device) {
		return console.error("Could not get GPU device.");
	}

	const context = canvas.getContext("webgpu");
	if (!context) {
		return console.error("Could not get webGPU canvas context");
	}

	setCanvasDisplayOptions(canvas, {
		customPixelScale: 1,
		imageRendering: "auto"
	});

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		format: presentationFormat,
		device
	});

	const module = device.createShaderModule({
		label: "Hardcoded red triangle shaders",
		code: renderShaderCode,
	});

	const computePipeline = device.createComputePipeline({
		label: "slime mold compute pipeline",
		layout: "auto",
		compute: {
			module: device.createShaderModule({
				code: computeShaderCode,
			}),
			entryPoint: "cs",
		},
	});

	const renderPipeline = device.createRenderPipeline({
		label: "slime mold render pipeline",
		layout: "auto",
		vertex: {
			module,
			entryPoint: "vs",
		},
		fragment: {
			module,
			entryPoint: "fs",
			targets: [{ format: presentationFormat }],
		}
	});

	const sampler = device.createSampler({
		addressModeU: "clamp-to-edge",
		addressModeV: "clamp-to-edge",
		magFilter: "nearest",
		minFilter: "nearest",
	});

	// * TEXTURES
	const textureWidth = simOptions.texWidth;
	const textureHeight = simOptions.texHeight;
	const defaultTextureColor = [255, 0, 255, 1];
	const textureData = new Uint8Array(
		new Array(textureWidth * textureHeight)
			.fill(defaultTextureColor)
			.map((_, i) => ([
				(i % textureWidth) / textureWidth * 255,
				Math.floor(i / textureWidth) / textureHeight * 255,
				255,
				0
			]))
			.flat()
	);

	const texture = device.createTexture({
		size: [textureWidth, textureHeight],
		format: "rgba8unorm",
		usage: GPUTextureUsage.COPY_DST
			| GPUTextureUsage.TEXTURE_BINDING
			| GPUTextureUsage.STORAGE_BINDING
		// idk if I need this one
		// | GPUTextureUsage.RENDER_ATTACHMENT
	});

	device.queue.writeTexture(
		{ texture },
		textureData,
		{ bytesPerRow: textureWidth * 4 },
		{ width: textureWidth, height: textureHeight },
	);

	// * BUFFERS -------------
	// Uniform - SceneInfo
	const uSceneInfoBufferSize = 4 * 2; // time(f32), dTime(f32)
	const uSceneInfoBuffer = device.createBuffer({
		size: uSceneInfoBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const uSceneInfoValues = new Float32Array(uSceneInfoBufferSize / 4);

	// Uniform - SimOptions
	const uSimOptionsBufferSize = 4 * 1 + 4; // 1 f32 + padding ig
	const uSimOptionsBuffer = device.createBuffer({
		size: uSimOptionsBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const uSimOptionsValues = new ArrayBuffer(uSceneInfoBufferSize);
	const uSimOptionsViews = {
		moveSpeed: new Float32Array(uSimOptionsValues, 0, 1),
		numAgents: new Int32Array(uSimOptionsValues, 4, 1),
	}

	// Storage - Agents
	const sAgentsBufferSize = 4 * 3 * simOptions.numAgents; // 3f32
	const sAgentsBuffer = device.createBuffer({
		size: sAgentsBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});
	const sAgentsBufferValues = new Float32Array(
		new Array(simOptions.numAgents)
			.fill(null)
			.map(() => [
				Math.random() * textureWidth,
				Math.random() * textureHeight,
				Math.random()
			])
			.flat()
	);
	device!.queue.writeBuffer(sAgentsBuffer, 0, sAgentsBufferValues);


	const computeBindGroup = device.createBindGroup({
		label: "compute bind group",
		layout: computePipeline.getBindGroupLayout(0),
		entries: [
			{
				binding: 0,
				resource: { buffer: uSceneInfoBuffer },
			},
			{
				binding: 1,
				resource: { buffer: uSimOptionsBuffer },
			},
			{
				binding: 2,
				resource: { buffer: sAgentsBuffer },
			},
			{
				binding: 3,
				resource: texture.createView(),
			}
		],
	});

	const bindGroup = device.createBindGroup({
		layout: renderPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: sampler },
			{ binding: 1, resource: texture.createView() }
		],
	});

	const renderPassDescriptor = {
		label: "basic canvas renderPass",
		colorAttachments: [{
			// typescript doesn't let `view` be undefined,
			// even tho webgpufundamentals leaves it undefined until render()
			view: context.getCurrentTexture().createView(),
			clearValue: [0.3, 0.3, 0.3, 1],
			loadOp: "clear",
			storeOp: "store",
		}],
	} satisfies GPURenderPassDescriptor;

	let then = 0;
	function render(now: number) {
		now *= 0.001;
		const deltaTime = now - then;
		then = now;

		uSceneInfoValues.set([now, deltaTime]);
		device!.queue.writeBuffer(uSceneInfoBuffer, 0, uSceneInfoValues);
		uSimOptionsViews.moveSpeed.set([simOptions.moveSpeed]);
		uSimOptionsViews.numAgents.set([simOptions.numAgents]);
		device!.queue.writeBuffer(uSimOptionsBuffer, 0, uSimOptionsValues);

		const encoder = device!.createCommandEncoder({ label: "slime mold encoder" });

		const computePass = encoder.beginComputePass();
		computePass.setPipeline(computePipeline);
		computePass.setBindGroup(0, computeBindGroup);
		computePass.dispatchWorkgroups(simOptions.numAgents);
		computePass.end();

		renderPassDescriptor.colorAttachments[0].view =
			context!.getCurrentTexture().createView();

		const renderPass = encoder.beginRenderPass(renderPassDescriptor);
		renderPass.setPipeline(renderPipeline);

		renderPass.setBindGroup(0, bindGroup);
		renderPass.draw(6);
		renderPass.end();

		const commandBuffer = encoder.finish();
		device!.queue.submit([commandBuffer]);

		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
}

export default createGPUSampleSection({
	title: "06_slime_molds",
	description: "This one is probably beyond me at the moment.",
	initFn: init,
});