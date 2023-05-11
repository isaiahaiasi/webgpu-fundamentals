import triShaderCode from "./shaders/tri.wgsl?raw";
import { observeResizableCanvas } from "../utils/observeCanvas";
import { getGPUDevice } from "../utils/wgpu-utils";

interface ObjectInfo {
	scale: number;
	uniformBuffer: GPUBuffer;
	uniformValues: Float32Array;
	bindGroup: GPUBindGroup;
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

	// create 2 buffers for the uniform values
	// (only scale needs to be updated each time)
	const staticUniformBufferSize =
		4 * 4 + // color: vec4f
		2 * 4 + // offset: vec2f
		2 * 4;  // padding

	const uniformBufferSize =
		2 * 4; // scale: vec2f

	const kColorOffset = 0;
	const kOffsetOffset = 4;
	const kScaleOffset = 0;

	const kNumObjects = 100;
	const objectInfos: ObjectInfo[] = [];

	for (let i = 0; i < kNumObjects; ++i) {
		const staticUniformBuffer = device.createBuffer({
			label: `static uniforms for obj: ${i}`,
			size: staticUniformBufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// these are only set once, so setting them immediately
		{
			// create a typedarray to hold the values for the uniforms in JS
			const uniformValues = new Float32Array(staticUniformBufferSize / 4);
			uniformValues.set([rand(), rand(), rand(), 1], kColorOffset); 		// set the color
			uniformValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], kOffsetOffset);	// set the offset

			// copy values to GPU
			device.queue.writeBuffer(staticUniformBuffer, 0, uniformValues);
		}

		// create a typedarray to hold vlaues for the uniforms in JS
		const uniformValues = new Float32Array(uniformBufferSize / 4);
		const uniformBuffer = device.createBuffer({
			label: `changing uniforms for obj: ${i}`,
			size: uniformBufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const bindGroup = device.createBindGroup({
			label: `bind group for obj: ${i}`,
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: staticUniformBuffer } },
				{ binding: 1, resource: { buffer: uniformBuffer } },
			],
		});

		objectInfos.push({
			scale: rand(0.2, 0.5),
			uniformBuffer,
			uniformValues,
			bindGroup,
		});
	}

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

		for (const { scale, bindGroup, uniformBuffer, uniformValues } of objectInfos) {
			uniformValues.set([scale / aspect, scale], kScaleOffset); // set the scale
			device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
			pass.setBindGroup(0, bindGroup);
			pass.draw(3);
		}

		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);
	}

	observeResizableCanvas(canvas, render, device);
}
