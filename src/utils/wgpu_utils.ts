type Time = {
	now: DOMHighResTimeStamp;
	deltaTime: number;
}

function fail(txt: string) {
	console.log(txt);
	// Emit an event that could update the UI when there's a failure?
}

export async function getGPUDevice(): Promise<GPUDevice | null> {
	if (!navigator.gpu) {
		fail("This browser does not support WebGPU");
		return null;
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		fail("This browser supports WebGPU, but it appears disabled");
		return null;
	}

	const device = await adapter.requestDevice();
	device.lost.then((info) => {
		console.error(`WebGPU device was lost: ${info.message}`);

		// "reason" will be "destroyed" if we *intentionally* destroy the device
		if (info.reason !== "destroyed") {
			// try again?
		}
	});

	return device;
}

export async function initWebGPU(
	canvas: HTMLCanvasElement
): Promise<[GPUDevice, GPUCanvasContext] | null> {
	const context = canvas.getContext("webgpu");
	if (!context) {
		fail("Could not get WebGPU canvas context");
		return null;
	}

	const device = await getGPUDevice();
	if (!device) {
		return null;
	}

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		format: presentationFormat,
		device
	});

	return [device, context];
}

export function handleRenderLoop(renderCB: (time: Time) => void) {
	const time: Time = {
		now: 0,
		deltaTime: 0,
	};

	async function render(now: number) {
		time.deltaTime = (now - time.now) * .001; // ms -> s
		time.now = now;
		renderCB(time);
		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
}
