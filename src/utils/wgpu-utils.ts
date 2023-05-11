export function fail(txt: string) {
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
