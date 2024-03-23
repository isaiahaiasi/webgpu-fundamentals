export type RenderTimeInfo = {
	now: DOMHighResTimeStamp;
	deltaTime: number;
}

export interface RenderLoopHandler {
	isActive(): boolean;
	start(): void;
	stop(): void;
	getFrameRequest(): number;
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
		// "reason" will be "destroyed" if we *intentionally* destroy the device
		if (info.reason !== "destroyed") {
			// If device was lost unintentionally, we may want to retry
			console.error(`WebGPU device was lost: ${info.message}`);
			console.log(info.reason);
		}
	});

	return device;
}

/** Sets up generalized render-loop. */
export function handleRenderLoop(
	renderCB: (time: RenderTimeInfo) => void,
	startsActive: boolean,
	options?: { stats?: Stats },
): RenderLoopHandler {
	// const handlerID = Date.now();
	let currentFrame = -1;
	const time: RenderTimeInfo = {
		now: 0,
		deltaTime: 0,
	};

	let isActive = startsActive;

	function render(now: number) {
		if (isActive) {
			options?.stats?.update();
			time.deltaTime = (now - time.now) * .001; // ms -> s
			time.now = now;
			renderCB(time);
			// console.log(isActive, handlerID);
			console.log(isActive)
			currentFrame = requestAnimationFrame(render);
		}
	}

	if (isActive) {
		currentFrame = requestAnimationFrame(render);
	}

	return {
		isActive() {
			return isActive;
		},
		getFrameRequest() {
			return currentFrame;
		},
		stop() {
			console.log("pausing");
			cancelAnimationFrame(currentFrame);
			isActive = false;
		},
		start() {
			// We don't want to re-call requestAnimationFrame if
			// we're already active.
			if (isActive) {
				return;
			}
			console.log("resuming");
			requestAnimationFrame(render);
			isActive = true;
		}
	};
}
