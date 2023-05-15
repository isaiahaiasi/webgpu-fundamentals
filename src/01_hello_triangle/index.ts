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

function createCircleVertices({
	radius = 1,
	numSubdivisions = 24,
	innerRadius = 0,
	startAngle = 0,
	endAngle = Math.PI * 2,
} = {}) {
	// 2 tris per subdivision, 3 verts per tri, 5 values (xy rgb) each
	const numVertices = numSubdivisions * 3 * 2;
	const vertexData = new Float32Array(numVertices * (2 + 3));

	let offset = 0;
	const addVertex = (x: number, y: number, r: number, g: number, b: number) => {
		vertexData[offset++] = x;
		vertexData[offset++] = y;
		vertexData[offset++] = r;
		vertexData[offset++] = g;
		vertexData[offset++] = b;
	};

	const innerColor = [1, 1, 1] as const;
	const outerColor = [0.1, 0.1, 0.1] as const;

	// 2 verts per subdiv
	// 0 2 4 6 8 ...
	// 1 3 5 7 9 ...
	for (let i = 0; i <= numSubdivisions; ++i) {
		const angle = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
		const c1 = Math.cos(angle);
		const s1 = Math.sin(angle);

		addVertex(c1 * radius, s1 * radius, ...outerColor);
		addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
	}

	const indexData = new Uint32Array(numSubdivisions * 6);
	let ndx = 0;

	// 0---2---4---...
	// | //| //|
	// |// |// |//
	// 1---3-- 5---...
	for (let i = 0; i < numSubdivisions; ++i) {
		const ndxOffset = i * 2;

		// first tri
		indexData[ndx++] = ndxOffset;
		indexData[ndx++] = ndxOffset + 1;
		indexData[ndx++] = ndxOffset + 2;

		// second tri
		indexData[ndx++] = ndxOffset + 2;
		indexData[ndx++] = ndxOffset + 1;
		indexData[ndx++] = ndxOffset + 3;
	}

	return {
		vertexData,
		indexData,
		numVertices,
	};
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
	context.configure({ device, format });

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
			buffers: [
				{
					arrayStride: 5 * 4, // vec2f (xy) & vec3f (rgb)
					attributes: [
						{ shaderLocation: 0, offset: 0, format: "float32x2" },		// pos
						{ shaderLocation: 1, offset: 8, format: "float32x3" }			// col
					],
				},
			],
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

	// storage buffer with vertex data
	const { vertexData, indexData, numVertices } = createCircleVertices({
		radius: 0.5,
		innerRadius: 0.25,
	});

	const vertexBuffer = device.createBuffer({
		label: "vertex buffer vertices",
		size: vertexData.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(vertexBuffer, 0, vertexData);

	const indexBuffer = device.createBuffer({
		label: "index buffer",
		size: indexData.byteLength,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(indexBuffer, 0, indexData);

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
		pass.setVertexBuffer(0, vertexBuffer);
		pass.setIndexBuffer(indexBuffer, "uint32");

		const aspect = canvas.width / canvas.height;

		objectInfos.forEach(({ scale }, i) => {
			const offset = i * (dynamicUnitSize / 4);
			storageValues.set([scale / aspect, scale], offset + kScaleOffset);
		});
		device.queue.writeBuffer(dynamicStorageBuffer, 0, storageValues);

		pass.setBindGroup(0, bindGroup);
		pass.drawIndexed(numVertices, kNumObjects);
		pass.end();

		const commandBuffer = encoder.finish();
		device.queue.submit([commandBuffer]);
	}

	observeResizableCanvas(canvas, device, { render });
}
