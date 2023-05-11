import triShaderCode from "./shaders/tri.wgsl?raw";
import { observeResizableCanvas } from "../utils/observeCanvas";

export async function main(canvas) {
	const adapter = await navigator.gpu?.requestAdapter();
	const device = await adapter?.requestDevice();

	if (!device) {
		console.error("Need a browser that supports WebGPU");
		return;
	}

	const context = canvas.getContext("webgpu");
	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format });

	const module = device.createShaderModule({
		label: "our hardcoded red triangle shaders",
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

	function render() {
		const renderPassDescriptor = {
			label: "our basic canvas renderPass",
			colorAttachments: [{
				// view: <- to be filled out when we render
				clearValue: [0.3, 0.3, 0.3, 1],
				loadOp: "clear",
				storeOp: "store",
			}],
		};

		// Get the current texture from the canvas context
		// and set it as the texture to render to
		renderPassDescriptor.colorAttachments[0].view =
			context.getCurrentTexture().createView();

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

	observeResizableCanvas(canvas, device, render);
}
