export function observeResizableCanvas(canvas: HTMLCanvasElement, device: any, render: () => void) {
	const observer = new ResizeObserver(entries => {
		for (const entry of entries) {
			const canvas = entry.target as HTMLCanvasElement;
			const width = entry.contentBoxSize[0].inlineSize;
			const height = entry.contentBoxSize[0].blockSize;
			canvas.width = Math.min(width, device.limits.maxTextureDimension2D);
			canvas.height = Math.min(height, device.limits.maxTextureDimension2D);
			render();
		}
	});

	observer.observe(canvas);
	return observer;
}
