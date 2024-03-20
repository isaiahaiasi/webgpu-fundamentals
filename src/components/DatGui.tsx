import { useEffect, useRef } from "preact/hooks";

export function DatGui({ gui }: { gui: dat.GUI }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ref.current) {
			return;
		}
		ref.current.appendChild(gui.domElement);
	}, [ref])

	return (
		<div ref={ref} class="settings-gui-container" />
	)
}
