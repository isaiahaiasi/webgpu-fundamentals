import { createGPUSampleSection } from "../utils/DOMHelpers";
import { setCanvasDisplayOptions } from "../utils/canvasHelpers";
import { getGPUDevice } from "../utils/wgpu-utils";

import shaderCode from "./shader.wgsl?raw";

async function init(canvas: HTMLCanvasElement) {
	const device = await getGPUDevice();
	if (!device) {
		return console.error("Could not get GPU device.");
	}

	const context = canvas.getContext("webgpu");
	if (!context) {
		return console.error("Could not get webGPU canvas context");
	}

	setCanvasDisplayOptions(canvas);

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		format: presentationFormat,
		device
	});

	const module = device.createShaderModule({
		label: "Hardcoded red triangle shaders",
		code: shaderCode,
	});

	const uniformBufferSize = 2 * 4; // vec2f
	const uniformBuffer = device.createBuffer({
		size: uniformBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const uniformValues = new Float32Array(uniformBufferSize / 4);

	const pipeline = device.createRenderPipeline({
		label: "hardcoded red triangle pipeline",
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

	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: uniformBuffer } },
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

	function render() {
		uniformValues.set([canvas.width, canvas.height]);
		device!.queue.writeBuffer(uniformBuffer, 0, uniformValues);

		renderPassDescriptor.colorAttachments[0].view =
			context!.getCurrentTexture().createView();

		const encoder = device!.createCommandEncoder({ label: "red tri encoder" });
		const pass = encoder.beginRenderPass(renderPassDescriptor);
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();

		const commandBuffer = encoder.finish();
		device!.queue.submit([commandBuffer]);
	}

	render();
}

export default createGPUSampleSection({
	title: "06_slime_molds",
	description: "This one is probably beyond me at the moment.",
	initFn: init,
});