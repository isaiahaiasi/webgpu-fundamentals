export type RenderTimeInfo = {
	now: DOMHighResTimeStamp;
	deltaTime: number;
}

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

export function handleRenderLoop(
	renderCB: (time: RenderTimeInfo) => void,
	options?: { stats?: Stats }
) {
	const time: RenderTimeInfo = {
		now: 0,
		deltaTime: 0,
	};

	let active = true;

	async function render(now: number) {
		options?.stats?.update();
		time.deltaTime = (now - time.now) * .001; // ms -> s
		time.now = now;
		renderCB(time);

		if (active) {
			requestAnimationFrame(render);
		}
	}

	requestAnimationFrame(render);

	return () => {
		active = false;
	}
}
