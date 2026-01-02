import { getGPUDevice } from "../../../utils/wgpu_utils";
import shaderCode from "./shader.wgsl?raw";

async function init(
	device: GPUDevice, context: GPUCanvasContext
) {

	// setCanvasDisplayOptions(context.canvas);

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		format: presentationFormat,
		device
	});

	const module = device.createShaderModule({
		label: "Hardcoded red triangle shaders",
		code: shaderCode,
	});

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

	return async function render() {
		renderPassDescriptor.colorAttachments[0].view =
			context.getCurrentTexture().createView();

		const encoder = device!.createCommandEncoder({ label: "red tri encoder" });
		const pass = encoder.beginRenderPass(renderPassDescriptor);
		pass.setPipeline(pipeline);
		pass.draw(3);
		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);
	}
}

export async function main(canvasId: string) {
	const canvas = document.getElementById(canvasId);
	if (!canvas) {
		console.error(`Could not get canvas with id ${canvasId}`);
	}

	const device = await getGPUDevice();
	if (!device) {
		return console.error("Could not get GPU device.");
	}

	const context = (canvas as HTMLCanvasElement).getContext("webgpu");
	if (!context) {
		return console.error("Could not get webGPU canvas context");
	}

	const render = await init(device, context);
	console.log("rendering triangle");
	render();
}
