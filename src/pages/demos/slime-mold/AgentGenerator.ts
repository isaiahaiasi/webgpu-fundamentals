type PosMethod = () => [number, number];
type DirMethod = (() => number) | ((pos: [number, number]) => number);
interface TextureDimensionOptions {
	texWidth: number;
	texHeight: number;
}

export default class AgentGenerator {
	cx: number;
	cy: number;
	w: number;
	h: number;

	constructor({ texWidth, texHeight }: TextureDimensionOptions) {
		this.w = texWidth;
		this.h = texHeight;
		this.cx = texWidth / 2;
		this.cy = texHeight / 2;
	}

	pos = {
		center: () => [this.cx, this.cy],
		field: () => [Math.random() * this.w, Math.random() * this.h],
		subField: (pct = 3) => [
			(this.w / pct) + Math.random() * this.w * (pct - 2) / pct,
			(this.w / pct) + Math.random() * this.h * (pct - 2) / pct,
		],
		filledCircle: (radiusScale = .5) => {
			const r = this.cy * radiusScale * Math.random();
			const theta = Math.random() * Math.PI * 2;
			return [
				this.cx + r * Math.cos(theta),
				this.cy + r * Math.sin(theta),
			];
		}
	} satisfies Record<string, (num?: number) => [number, number]>;

	dir = {
		random: () => Math.random() * Math.PI * 2,
		toCenter: (pos: [number, number]) =>
			Math.atan2(pos[1] - this.cy, pos[0] - this.cx) + Math.PI,
		fromCenter: (pos: [number, number]) =>
			Math.atan2(pos[1] - this.cy, pos[0] - this.cx),
	};


	createSpawnData(
		positionFn: PosMethod,
		directionFn: DirMethod,
	) {
		const pos = positionFn();
		return [
			...pos,
			directionFn(pos),
			0
		];
	}

	getAgents(
		numAgents: number,
		positionFn: PosMethod,
		directionFn: DirMethod,
	) {
		return new Array(numAgents)
			.fill(0)
			.map(() => this.createSpawnData(positionFn, directionFn))
			.flat();
	}
}
