import { createGPUSampleSection } from "../utils/DOMHelpers";
import { setCanvasDisplayOptions } from "../utils/canvasHelpers";
import { getGPUDevice } from "../utils/wgpu-utils";

import renderShaderCode from "./render.wgsl?raw";
import computeShaderCode from "./compute.wgsl?raw";

const simOptions = {
	diffuseSpeed: 15,
	evaporateSpeed: .4,
	includeBg: false,
	moveSpeed: 40,
	numAgents: 500,
	texWidth: 256,
	texHeight: 128,
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

	const computeModule = device.createShaderModule({
		label: "slime mold::module::compute",
		code: computeShaderCode,
	});

	const renderModule = device.createShaderModule({
		label: "slime mold::module::render",
		code: renderShaderCode,
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

	const bgTexture = (() => {
		const bgTexData = new Uint8Array(
			new Array(textureWidth * textureHeight)
				.fill(0)
				.map((_, i) => (simOptions.includeBg ? [
					(i % textureWidth) / textureWidth * 255,
					Math.floor(i / textureWidth) / textureHeight * 255,
					255,
					0 // not sure it's possible to align an array of vec3s???
				] : [0, 0, 0, 0]))
				.flat()
		);

		const texture = device.createTexture({
			size: [textureWidth, textureHeight],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			bgTexData,
			{ bytesPerRow: textureWidth * 4 },
			{ width: textureWidth, height: textureHeight },
		);

		return texture;
	})();

	const agentsTexture = (() => {
		// initialize with all 0s
		const agentsTexData = new Uint8Array(
			new Array(textureWidth * textureHeight * 4).fill(0)
		);

		const texture = device.createTexture({
			size: [textureWidth, textureHeight],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			agentsTexData,
			{ bytesPerRow: textureWidth * 4 },
			{ width: textureWidth, height: textureHeight },
		);

		return texture;
	})();

	const trailTexture = (() => {
		// initialize with all 0s
		const agentsTexData = new Uint8Array(
			new Array(textureWidth * textureHeight * 4).fill(0)
		);

		const texture = device.createTexture({
			size: [textureWidth, textureHeight],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.COPY_SRC
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			agentsTexData,
			{ bytesPerRow: textureWidth * 4 },
			{ width: textureWidth, height: textureHeight },
		);

		return texture;
	})();

	// ! FIXME: I cannot figure out how to split bind groups in a single shader module
	// So I'm passing unnecessary and dummy data to the shader...
	const dummyTexture = (() => {
		const dummySize = 4;
		// initialize with all 0s
		const agentsTexData = new Uint8Array(
			new Array(dummySize * dummySize * 4).fill(0)
		);

		const texture = device.createTexture({
			size: [dummySize, dummySize],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			agentsTexData,
			{ bytesPerRow: dummySize * 4 },
			{ width: dummySize, height: dummySize },
		);

		return texture;
	})();


	// * BUFFERS -------------
	// Uniform - SceneInfo
	const uSceneInfoBufferSize = 8; // time(f32), dTime(f32)
	const uSceneInfoBuffer = device.createBuffer({
		size: uSceneInfoBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const uSceneInfoValues = new Float32Array(uSceneInfoBufferSize / 4);

	// Uniform - SimOptions
	const uSimOptionsBufferSize = 16;
	const uSimOptionsBuffer = device.createBuffer({
		size: uSimOptionsBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const uSimOptionsValues = new ArrayBuffer(uSimOptionsBufferSize);
	const uSimOptionsViews = {
		diffuseSpeed: new Float32Array(uSimOptionsValues, 0, 1),
		evaporateSpeed: new Float32Array(uSimOptionsValues, 4, 1),
		moveSpeed: new Float32Array(uSimOptionsValues, 8, 1),
		numAgents: new Uint32Array(uSimOptionsValues, 12, 1),
	};


	// Storage - Agents
	const sAgentsBufferSize = 16 * simOptions.numAgents; // 3f32
	const sAgentsBuffer = device.createBuffer({
		size: sAgentsBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});
	const sAgentsBufferValues = new Float32Array(
		new Array(simOptions.numAgents)
			.fill(null)
			.map(() => [
				simOptions.texWidth / 2,
				simOptions.texHeight / 2,
				Math.random() * Math.PI * 2,
				0,
			])
			.flat()
	);
	device.queue.writeBuffer(sAgentsBuffer, 0, sAgentsBufferValues);

	const computeBindGroupLayout0 = device.createBindGroupLayout({
		entries: [
			{
				binding: 0,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: "uniform" },
			},
			{
				binding: 1,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: "uniform" },
			},
		]
	});

	const computeBindGroupLayout1 = device.createBindGroupLayout({
		entries: [
			{
				binding: 2,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: "storage" },
			},
			{
				binding: 3,
				visibility: GPUShaderStage.COMPUTE,
				storageTexture: { format: "rgba8unorm" },
			},
			{
				binding: 4,
				visibility: GPUShaderStage.COMPUTE,
				texture: {},
			},
			{
				binding: 5,
				visibility: GPUShaderStage.COMPUTE,
				storageTexture: { format: "rgba8unorm" },
			},
		]
	});


	const computeUpdatePipeline = device.createComputePipeline({
		label: "slime mold::pipeline::compute::update_agents",
		layout: device.createPipelineLayout({
			bindGroupLayouts: [computeBindGroupLayout0, computeBindGroupLayout1]
		}),
		compute: {
			module: computeModule,
			entryPoint: "update_agents",
		},
	});

	const computeProcessPipeline = device.createComputePipeline({
		label: "slime mold::pipeline::compute::process_trailmap",
		layout: device.createPipelineLayout({
			bindGroupLayouts: [computeBindGroupLayout0, computeBindGroupLayout1]
		}),
		compute: {
			module: computeModule,
			entryPoint: "process_trailmap",
		},
	});

	const renderPipeline = device.createRenderPipeline({
		label: "slime mold::pipeline::render",
		layout: "auto",
		vertex: {
			module: renderModule,
			entryPoint: "vs",
		},
		fragment: {
			module: renderModule,
			entryPoint: "fs",
			targets: [{ format: presentationFormat }],
		}
	});


	const computeBindGroup0 = device.createBindGroup({
		label: "slime mold::bindgroup::compute::0",
		layout: computeUpdatePipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: uSceneInfoBuffer } },
			{ binding: 1, resource: { buffer: uSimOptionsBuffer } },
		],
	});

	const computeBindGroup1 = device.createBindGroup({
		label: "slime mold::bindgroup::compute::1",
		layout: computeUpdatePipeline.getBindGroupLayout(1),
		entries: [
			{ binding: 2, resource: { buffer: sAgentsBuffer } },
			{ binding: 3, resource: agentsTexture.createView() },
			{ binding: 4, resource: dummyTexture.createView() },
			{ binding: 5, resource: trailTexture.createView() },
		],
	});

	const computeBindGroup2 = device.createBindGroup({
		label: "slime mold::bindgroup::compute::2",
		layout: computeUpdatePipeline.getBindGroupLayout(1),
		entries: [
			{ binding: 2, resource: { buffer: sAgentsBuffer } },
			{ binding: 3, resource: dummyTexture.createView() },
			{ binding: 4, resource: agentsTexture.createView() },
			{ binding: 5, resource: trailTexture.createView() },
		],
	});

	const renderBindGroup = device.createBindGroup({
		label: "slime mold::bindgroup::render::0",
		layout: renderPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: sampler },
			{ binding: 1, resource: bgTexture.createView() },
			{ binding: 2, resource: trailTexture.createView() },
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
		const fpsCounter = document.querySelector("#fps-counter");
		if (fpsCounter) {
			fpsCounter.textContent = "time: " + deltaTime;
		}

		uSceneInfoValues.set([now, deltaTime]);
		device!.queue.writeBuffer(uSceneInfoBuffer, 0, uSceneInfoValues);
		uSimOptionsViews.diffuseSpeed.set([simOptions.diffuseSpeed]);
		uSimOptionsViews.evaporateSpeed.set([simOptions.evaporateSpeed]);
		uSimOptionsViews.moveSpeed.set([simOptions.moveSpeed]);
		uSimOptionsViews.numAgents.set([simOptions.numAgents]);
		device!.queue.writeBuffer(uSimOptionsBuffer, 0, uSimOptionsValues);

		const encoder = device!.createCommandEncoder({ label: "slime mold encoder" });

		let computePass = encoder.beginComputePass();
		computePass.setPipeline(computeUpdatePipeline);
		computePass.setBindGroup(0, computeBindGroup0);
		computePass.setBindGroup(1, computeBindGroup1);
		computePass.dispatchWorkgroups(simOptions.numAgents);
		computePass.end();

		computePass = encoder.beginComputePass();
		computePass.setPipeline(computeProcessPipeline);
		computePass.setBindGroup(0, computeBindGroup0);
		computePass.setBindGroup(1, computeBindGroup2);
		computePass.dispatchWorkgroups(textureWidth, textureHeight);
		computePass.end();

		renderPassDescriptor.colorAttachments[0].view =
			context!.getCurrentTexture().createView();

		const renderPass = encoder.beginRenderPass(renderPassDescriptor);
		renderPass.setPipeline(renderPipeline);

		renderPass.setBindGroup(0, renderBindGroup);
		renderPass.draw(6);
		renderPass.end();

		encoder.copyTextureToTexture(
			{ texture: trailTexture },
			{ texture: agentsTexture },
			[textureWidth, textureHeight, 1],
		);

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