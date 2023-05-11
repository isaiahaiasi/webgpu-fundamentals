import triShaderCode from "./shaders/tri.wgsl?raw";
import { observeResizableCanvas } from "../utils/observeCanvas";
import { getGPUDevice } from "../utils/wgpu-utils";

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
		pass.draw(3);
		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);
	}

	observeResizableCanvas(canvas, render, device);
}
