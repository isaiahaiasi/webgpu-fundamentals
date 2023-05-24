import { createGPUSampleSection } from "../utils/DOMHelpers";
import { setCanvasDisplayOptions } from "../utils/canvasHelpers";
import { getGPUDevice } from "../utils/wgpu-utils";

import renderShaderCode from "./render.wgsl?raw";
import computeShaderCode from "./compute.wgsl?raw";
import AgentGenerator from "./AgentGenerator";

const options = {
	includeBg: false,
	debug: false,
	texWidth: 512,
	texHeight: 256,
};

const shaderOptions = {
	numAgents: 600, // TODO: change to vec3
	evaporateSpeed: 1,
	evaporateWeight: [0.4, 0.2, 0.1, 1],
	diffuseSpeed: 50,
	moveSpeed: 25,
	sensorAngle: 10 * (Math.PI / 180), // radian angle of left/right sensors
	sensorDst: 5,
	sensorSize: 3, // square radius around sensor center
	turnSpeed: 20,
};

const agentGenerator = new AgentGenerator(options);
const agents = agentGenerator.getAgents(
	[shaderOptions.numAgents, shaderOptions.numAgents, 1],
	agentGenerator.pos.filledCircle,
	agentGenerator.dir.fromCenter,
);

const textureOptions: GPUSamplerDescriptor = {
	addressModeU: "clamp-to-edge",
	addressModeV: "clamp-to-edge",
	magFilter: "linear",
	minFilter: "linear",
};

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

	const sampler = device.createSampler(textureOptions);

	// * TEXTURES

	const bgTexture = (() => {
		const bgTexData = new Uint8Array(
			new Array(options.texWidth * options.texHeight)
				.fill(0)
				.map((_, i) => (options.includeBg ? [
					(i % options.texWidth) / options.texWidth * 255,
					Math.floor(i / options.texWidth) / options.texHeight * 255,
					255,
					0 // not sure it's possible to align an array of vec3s???
				] : [0, 0, 0, 0]))
				.flat()
		);

		const texture = device.createTexture({
			size: [options.texWidth, options.texHeight],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			bgTexData,
			{ bytesPerRow: options.texWidth * 4 },
			{ width: options.texWidth, height: options.texHeight },
		);

		return texture;
	})();

	const agentsTexture = (() => {
		// initialize with all 0s
		const agentsTexData = new Uint8Array(
			new Array(options.texWidth * options.texHeight * 4).fill(0)
		);

		const texture = device.createTexture({
			size: [options.texWidth, options.texHeight],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			agentsTexData,
			{ bytesPerRow: options.texWidth * 4 },
			{ width: options.texWidth, height: options.texHeight },
		);

		return texture;
	})();

	const trailTexture = (() => {
		// initialize with all 0s
		const agentsTexData = new Uint8Array(
			new Array(options.texWidth * options.texHeight * 4).fill(0)
		);

		const texture = device.createTexture({
			size: [options.texWidth, options.texHeight],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_DST
				| GPUTextureUsage.COPY_SRC
				| GPUTextureUsage.TEXTURE_BINDING
				| GPUTextureUsage.STORAGE_BINDING
		});

		device.queue.writeTexture(
			{ texture },
			agentsTexData,
			{ bytesPerRow: options.texWidth * 4 },
			{ width: options.texWidth, height: options.texHeight },
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
	// MUST BE IN ALPHABETICAL ORDER TO MATCH WGSL STRUCT!
	const uSimOptionsValues = new ArrayBuffer(64);
	const uSimOptionsViews = {
		diffuseSpeed: new Float32Array(uSimOptionsValues, 0, 1),
		evaporateSpeed: new Float32Array(uSimOptionsValues, 4, 1),
		evaporateWeight: new Float32Array(uSimOptionsValues, 16, 4),
		moveSpeed: new Float32Array(uSimOptionsValues, 32, 1),
		numAgents: new Uint32Array(uSimOptionsValues, 36, 1),
		sensorAngle: new Float32Array(uSimOptionsValues, 40, 1),
		sensorDst: new Float32Array(uSimOptionsValues, 44, 1),
		sensorSize: new Uint32Array(uSimOptionsValues, 48, 1),
		turnSpeed: new Float32Array(uSimOptionsValues, 52, 1),
	};


	const uSimOptionsBuffer = device.createBuffer({
		size: uSimOptionsValues.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// Storage - Debug

	const debugInputBufferValues = new Float32Array([0, 0, 0, 0, 0, 0]);
	const uDebugInputBuffer = device.createBuffer({
		label: "debug input buffer",
		size: debugInputBufferValues.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});

	device.queue.writeBuffer(uDebugInputBuffer, 0, debugInputBufferValues);

	// Create a buffer on the GPU to get a copy of the results
	const uDebugOutputBuffer = device.createBuffer({
		label: "debug output buffer",
		size: debugInputBufferValues.byteLength,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
	});


	// Storage - Agents
	const sAgentsBufferSize = 16 * shaderOptions.numAgents * shaderOptions.numAgents; // 3f32
	const sAgentsBuffer = device.createBuffer({
		size: sAgentsBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});

	const sAgentsBufferValues = new Float32Array(agents);
	device.queue.writeBuffer(sAgentsBuffer, 0, sAgentsBufferValues);

	// * BIND GROUP LAYOUTS
	// These are very tedious and repetitive
	// but I need them to share bind groups between pipelines

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
			{
				binding: 2,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: "storage" },
			},
		],
	});

	const computeBindGroupLayout1 = device.createBindGroupLayout({
		entries: [
			{
				binding: 0,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: "storage" },
			},
			{
				binding: 1,
				visibility: GPUShaderStage.COMPUTE,
				storageTexture: { format: "rgba8unorm" },
			},
			{
				binding: 2,
				visibility: GPUShaderStage.COMPUTE,
				texture: {},
			},
		]
	});

	// * PIPELINES

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


	// * BIND GROUPS

	const computeBindGroup0 = device.createBindGroup({
		label: "slime mold::bindgroup::compute::0",
		layout: computeUpdatePipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: uSceneInfoBuffer } },
			{ binding: 1, resource: { buffer: uSimOptionsBuffer } },
			{ binding: 2, resource: { buffer: uDebugInputBuffer } },
		],
	});

	const computeBindGroup1 = device.createBindGroup({
		label: "slime mold::bindgroup::compute::1",
		layout: computeUpdatePipeline.getBindGroupLayout(1),
		entries: [
			{ binding: 0, resource: { buffer: sAgentsBuffer } },
			{ binding: 1, resource: agentsTexture.createView() },
			{ binding: 2, resource: trailTexture.createView() },
		],
	});

	const computeBindGroup2 = device.createBindGroup({
		label: "slime mold::bindgroup::compute::2",
		layout: computeUpdatePipeline.getBindGroupLayout(1),
		entries: [
			{ binding: 0, resource: { buffer: sAgentsBuffer } },
			{ binding: 1, resource: trailTexture.createView() },
			{ binding: 2, resource: agentsTexture.createView() },
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
	let renderCount = 0; // for debouncing debug logs...
	async function render(now: number) {
		renderCount += 1 % 60000;
		now *= 0.001; // ms -> secs
		const deltaTime = now - then;
		then = now;
		const fpsCounter = document.querySelector("#fps-counter");
		if (fpsCounter) {
			fpsCounter.textContent = "time: " + deltaTime;
		}

		uSceneInfoValues.set([now, deltaTime]);
		device!.queue.writeBuffer(uSceneInfoBuffer, 0, uSceneInfoValues);

		// iterate all entries of shaderOptions into typedarray, then write to buffer
		Object.entries(shaderOptions).forEach(([k, v]) => {
			const key = k as keyof typeof shaderOptions;
			uSimOptionsViews[key].set(Array.isArray(v) ? v : [v]);
		});
		device!.queue.writeBuffer(uSimOptionsBuffer, 0, uSimOptionsValues);

		const encoder = device!.createCommandEncoder({ label: "slime mold::encoder" });

		let computePass = encoder.beginComputePass();
		computePass.setPipeline(computeUpdatePipeline);
		computePass.setBindGroup(0, computeBindGroup0);
		computePass.setBindGroup(1, computeBindGroup1);
		computePass.dispatchWorkgroups(shaderOptions.numAgents, shaderOptions.numAgents);
		computePass.end();

		computePass = encoder.beginComputePass();
		computePass.setPipeline(computeProcessPipeline);
		computePass.setBindGroup(0, computeBindGroup0);
		computePass.setBindGroup(1, computeBindGroup2);
		computePass.dispatchWorkgroups(options.texWidth, options.texHeight);
		computePass.end();


		renderPassDescriptor.colorAttachments[0].view =
			context!.getCurrentTexture().createView();

		const renderPass = encoder.beginRenderPass(renderPassDescriptor);
		renderPass.setPipeline(renderPipeline);

		renderPass.setBindGroup(0, renderBindGroup);
		renderPass.draw(6);
		renderPass.end();


		encoder.copyBufferToBuffer(
			uDebugInputBuffer, 0,
			uDebugOutputBuffer, 0,
			uDebugOutputBuffer.size
		);
		encoder.copyTextureToTexture(
			{ texture: trailTexture },
			{ texture: agentsTexture },
			[options.texWidth, options.texHeight, 1],
		);

		const commandBuffer = encoder.finish();
		device!.queue.submit([commandBuffer]);

		// console.log debug buffer values
		if (options.debug && renderCount % 420 == 2) {
			await uDebugOutputBuffer.mapAsync(GPUMapMode.READ);
			const res = new Float32Array(uDebugOutputBuffer.getMappedRange());
			console.log(res);

			uDebugOutputBuffer.unmap();
		}


		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
}

export default createGPUSampleSection({
	title: "06_slime_molds",
	description: "Slime mold simulation, compute shader experiments.",
	initFn: init,
});