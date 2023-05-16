import { createGPUSampleSection } from "../utils/DOMHelpers";
import { observeResizableCanvas } from "../utils/observeCanvas";
import { getGPUDevice } from "../utils/wgpu-utils";
import simpleCompute from "./shaders/simple-compute.wgsl?raw";


export async function main(canvas: HTMLCanvasElement) {
	const device = await getGPUDevice();

	if (!device) {
		console.error("Need a browser that supports WebGPU");
		return;
	}

	const module = device.createShaderModule({
		label: "doubling compute module",
		code: simpleCompute,
	});

	const pipeline = device.createComputePipeline({
		label: "Doubling compute pipeline",
		layout: "auto",
		compute: {
			module,
			entryPoint: "computeSomething",
		},
	});

	// Create data and send to compute shader
	const input = new Float32Array([1, 3, 5]);
	const workBuffer = device.createBuffer({
		label: "work buffer",
		size: input.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});

	device.queue.writeBuffer(workBuffer, 0, input);

	// Create a buffer on the GPU to get a copy of the results
	const resultBuffer = device.createBuffer({
		label: "result buffer",
		size: input.byteLength,
		usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
	});

	//Set up a bindGroup to tell the shader which buffer to use
	const bindGroup = device.createBindGroup({
		label: "bindGroup for work buffer",
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: workBuffer } },
		],
	});

	// Encode commands to do the computation
	const encoder = device.createCommandEncoder({
		label: "doubling encoder",
	});
	const pass = encoder.beginComputePass({
		label: "doubling compute pass",
	});
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.dispatchWorkgroups(input.length);
	pass.end();

	// Encode a command to copy the results to a mappable buffer
	encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

	// Finish encoding and submit the commands
	const commandBuffer = encoder.finish();
	device.queue.submit([commandBuffer]);

	// Read the results
	await resultBuffer.mapAsync(GPUMapMode.READ);
	// Maps to a Float32Array, but need to spread into a normal Array to unmap the buffer
	// (probably not best practice, I just want to be able to re-render)
	const result = [...new Float32Array(resultBuffer.getMappedRange())];
	resultBuffer.unmap();

	// Draw the input & result to the canvas
	function render() {
		const context = canvas.getContext("2d");

		if (!context) {
			console.error("Could not get 2d canvas context");
			return;
		}

		context.fillStyle = "black";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.font = "18px sans-serif";
		context.fillStyle = "white";
		context.fillText(`input: [${input}], result: [${result}]`, 5, canvas.height - 10);
	}

	observeResizableCanvas(canvas, device, { render, customPixelScale: 1 / 4 });
}


export default createGPUSampleSection({
	title: "02_hello_compute",
	description: "Very simple code showing a minimal example of processing data through a compute shader.",
	initFn: main,
});
