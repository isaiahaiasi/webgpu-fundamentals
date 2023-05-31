import { observeResizableCanvas } from "../../utils/canvasHelpers";
import { getGPUDevice } from "../../utils/wgpu-utils";
import shaderCode from "./shader.wgsl?raw";

interface TextureSettings {
	addressModeU: GPUAddressMode;
	addressModeV: GPUAddressMode;
	magFilter: GPUFilterMode;
	minFilter: GPUFilterMode;
}

const textureSettings: TextureSettings = {
	addressModeU: "clamp-to-edge",
	addressModeV: "clamp-to-edge",
	magFilter: "linear",
	minFilter: "linear",
};

export async function init(canvas: HTMLCanvasElement) {
	const device = await getGPUDevice();

	if (!device) {
		return console.error("could not get device");
	}

	const context = canvas.getContext("webgpu");

	if (!context) {
		return console.error("could not get gpu canvas context");
	}

	const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

	context.configure({
		device,
		format: canvasFormat,
	});

	const module = device.createShaderModule({
		label: "texture demo shader module",
		code: shaderCode,
	});

	const pipeline = device.createRenderPipeline({
		label: "texture demo render pipeline",
		layout: "auto",
		vertex: {
			module,
			entryPoint: "vs",
		},
		fragment: {
			module,
			entryPoint: "fs",
			targets: [{ format: canvasFormat }],
		},
	});

	// Texture stuff
	const kTextureWidth = 5;
	const kTextureHeight = 7;
	const _ = [255, 0, 0, 255]; // red
	const y = [255, 255, 0, 255]; // yellow
	const b = [0, 0, 255, 255]; // blue
	// flipped vertically
	const textureData = new Uint8Array([
		_, _, _, _, _,
		_, y, _, _, _,
		_, y, _, _, _,
		_, y, y, _, _,
		_, y, _, _, _,
		_, y, y, y, _,
		b, _, _, _, _,
	].flat());

	const texture = device.createTexture({
		size: [kTextureWidth, kTextureHeight],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
	});

	device.queue.writeTexture(
		{ texture },
		textureData,
		{ bytesPerRow: kTextureWidth * 4 },
		{ width: kTextureWidth, height: kTextureHeight },
	);

	// create buffer for uniforms
	const uniformBufferSize = 2 * 4 + 2 * 4; // scale: vec2f, offset: vec2f
	const uniformBuffer = device.createBuffer({
		label: "uniforms for quad",
		size: uniformBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	// create typedarray to hold values in js
	const uniformValues = new Float32Array(uniformBufferSize / 4);
	// offsets to the various uniform values in float32 indices
	const kScaleOffset = 0;
	const kOffsetOffset = 2;

	const bindGroups: GPUBindGroup[] = [];
	for (let i = 0; i < 16; ++i) {
		const sampler = device.createSampler({
			addressModeU: (i & 1) ? "repeat" : "clamp-to-edge",
			addressModeV: (i & 2) ? "repeat" : "clamp-to-edge",
			magFilter: (i & 4) ? "linear" : "nearest",
			minFilter: (i & 8) ? "linear" : "nearest",
		});

		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: sampler },
				{ binding: 1, resource: texture.createView() },
				{ binding: 2, resource: { buffer: uniformBuffer } },
			],
		});

		bindGroups.push(bindGroup)
	}

	const renderPassDescriptor = {
		label: "texture demo render pass descriptor",
		colorAttachments: [{
			view: context.getCurrentTexture().createView(),
			clearValue: [0.3, 0.3, 0.3, 1],
			loadOp: "clear",
			storeOp: "store",
		}],
	} satisfies GPURenderPassDescriptor;

	function render(time: number) {
		time *= 0.001;

		if (!device) {
			return console.error("Need a browser that supports WebGPU");
		}

		if (!context) {
			return console.error("Could not get canvas context");
		}

		const ndx = (textureSettings.addressModeU === "repeat" ? 1 : 0) +
			(textureSettings.addressModeV === "repeat" ? 2 : 0) +
			(textureSettings.magFilter === "linear" ? 4 : 0) +
			(textureSettings.minFilter === "linear" ? 8 : 0);

		const bindGroup = bindGroups[ndx];

		// compute scale that will draw our 0 to 1 clip space quad
		const scaleX = 4 / canvas.width;
		const scaleY = 4 / canvas.height;

		uniformValues.set([scaleX, scaleY], kScaleOffset);
		uniformValues.set([Math.sin(time * 0.25) * 0.8, -0.8], kOffsetOffset);

		// copy values from JS to GPU
		device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

		renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
		const encoder = device.createCommandEncoder();

		const pass = encoder.beginRenderPass(renderPassDescriptor);
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(6);
		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);
		requestAnimationFrame(render);
	}
	observeResizableCanvas(canvas, device, { customPixelScale: 1 / 64, useDevicePixelRatio: false, imageRendering: "pixelated" });
	requestAnimationFrame(render);

}

export const textureSampleInfo = {
	title: "04_textures",
	description: "Sample code on the basics of textures in WebGPU, including mag/minFilters and minmaps",
	init,
};
