import simpleCompute from "./shaders/simple-compute.wgsl?raw";

/**
 * @param {HTMLCanvasElement} canvas 
 * @returns {void}
 */
export async function main(canvas) {
	const adapter = await navigator.gpu?.requestAdapter();
	const device = await adapter?.requestDevice();

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
	const result = new Float32Array(resultBuffer.getMappedRange());

	// Draw the input & result to the canvas
	console.log("input", input);
	console.log("result", result);

	const context = canvas.getContext("2d");
	context.fillStyle = "black";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.font = "18px sans-serif";
	context.fillStyle = "white";
	context.fillText(`input: [${input}], result: [${result}]`, 5, canvas.height - 10);

	resultBuffer.unmap();
}