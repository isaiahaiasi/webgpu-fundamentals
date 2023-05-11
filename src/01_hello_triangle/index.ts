import triShaderCode from "./shaders/tri.wgsl?raw";
import { observeResizableCanvas } from "../utils/observeCanvas";
import { getGPUDevice } from "../utils/wgpu-utils";

interface ObjectInfo {
	scale: number;
	// uniformBuffer: GPUBuffer;
	// uniformValues: Float32Array;
	// bindGroup: GPUBindGroup;
}

function rand(min?: number, max?: number) {
	if (min == undefined) {
		min = 0;
		max = 1;
	} else if (max == undefined) {
		max = min;
		min = 0;
	}

	return min + Math.random() * (max - min);
}

export async function main(canvas: HTMLCanvasElement) {
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

	const format = navigator.gpu.getPreferredCanvasFormat();
	context!.configure({ device, format });

	const module = device.createShaderModule({
		label: "our hardcoded rgb triangle shaders",
		code: triShaderCode,
	});

	const pipeline = device.createRenderPipeline({
		label: "our hardcoded red triangle pipeline",
		layout: "auto",
		vertex: {
			module,
			entryPoint: "vs",
		},
		fragment: {
			module,
			entryPoint: "fs",
			targets: [{ format }]
		}
	});


	const kNumObjects = 100;
	const objectInfos: ObjectInfo[] = [];

	const staticUnitSize =
		4 * 4 + // color: vec4f
		2 * 4 + // offset: vec2f
		2 * 4;  // padding

	const dynamicUnitSize =
		2 * 4; // scale: vec2f

	const staticStorageBufferSize = staticUnitSize * kNumObjects;
	const dynamicStorageBufferSize = dynamicUnitSize * kNumObjects;

	const staticStorageBuffer = device.createBuffer({
		label: 'static storage for objects',
		size: staticStorageBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const dynamicStorageBuffer = device.createBuffer({
		label: 'dynamic storage for objects',
		size: dynamicStorageBufferSize,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const kColorOffset = 0;
	const kOffsetOffset = 4;
	const kScaleOffset = 0;

	{
		const staticStorageValues = new Float32Array(staticStorageBufferSize / 4);
		for (let i = 0; i < kNumObjects; ++i) {
			const staticOffset = i * (staticUnitSize / 4);

			// These are only set once so set them now
			staticStorageValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);
			staticStorageValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);

			objectInfos.push({
				scale: rand(0.2, 0.5),
			});
		}

		device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
	}

	// typed array we can use to update the dynamicStorageBuffer
	const storageValues = new Float32Array(dynamicStorageBufferSize / 4);

	const bindGroup = device.createBindGroup({
		label: 'bind group for objects',
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: staticStorageBuffer } },
			{ binding: 1, resource: { buffer: dynamicStorageBuffer } },
		],
	});

	const renderPassDescriptor = {
		label: "our basic canvas renderPass",
		colorAttachments: [{
			// JS example doesn't initialize with `view`,
			// but current typing must define it
			view: context.getCurrentTexture().createView(),
			clearValue: [0.3, 0.3, 0.3, 1],
			loadOp: "clear",
			storeOp: "store",
		}],
		// using `satisfies` because current typing describes colorAttachments as Iterator,
		// but I want to index into the array 
	} satisfies GPURenderPassDescriptor;

	function render() {
		if (!device) {
			console.error("Need a browser that supports WebGPU");
			return;
		}

		if (!context) {
			console.error("Could not get canvas context");
			return;
		}

		// Get the current texture from the canvas context
		// and set it as the texture to render to
		renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

		// Make a command encoder to start encoding commands
		const encoder = device.createCommandEncoder({ label: "our encoder" });

		// Make a render pass encoder to encode render-specific commands
		const pass = encoder.beginRenderPass(renderPassDescriptor);
		pass.setPipeline(pipeline);

		const aspect = canvas.width / canvas.height;

		objectInfos.forEach(({ scale }, i) => {
			const offset = i * (dynamicUnitSize / 4);
			storageValues.set([scale / aspect, scale], offset + kScaleOffset);
		});
		device.queue.writeBuffer(dynamicStorageBuffer, 0, storageValues);

		pass.setBindGroup(0, bindGroup);
		pass.draw(3, kNumObjects);
		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);
	}

	observeResizableCanvas(canvas, render, device);
}
