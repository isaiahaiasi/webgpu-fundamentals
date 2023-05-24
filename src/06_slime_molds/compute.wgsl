const PI = 3.14159265359;

struct SceneInfo {
	time: f32,
	deltaTime: f32,
};

// ALPHABETICALLY ORDERED
struct SimOptions {
	diffuseSpeed: f32,
	evaporateSpeed: f32,
	evaporateWeight: vec4f,
	moveSpeed: f32,
	agentCounts: vec3u,
	sensorAngle: f32,
	sensorDst: f32,
	sensorSize: u32,
	turnSpeed: f32,
};

struct Agent {
	pos: vec2f,
	angle: f32,
};

// Hash function www.cs.ubc.ca/~rbridson/docs/schechter-sca08-turbulence.pdf
fn hash(s: u32) -> u32 {
    var state = s;
    state ^= 2747636419u;
    state *= 2654435769u;
    state ^= state >> 16;
    state *= 2654435769u;
    state ^= state >> 16;
    state *= 2654435769u;
    return state;
}

fn normHash(s: u32) -> f32 {
	return f32(s) / 4294967295.0;
}


@group(0) @binding(0) var<uniform> info: SceneInfo;
@group(0) @binding(1) var<uniform> options: SimOptions; // uniform vs storage?
@group(0) @binding(2) var<storage, read_write> debug: array<f32, 6>;

@group(1) @binding(0) var<storage, read_write> agents: array<Agent>;
@group(1) @binding(1) var writeTex: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(2) var readTex: texture_2d<f32>;

// add up each trail texel within bounds of agent sensor
fn sense(agent: Agent, sensorAngleOffset: f32) -> vec3f {
	var tDims = vec2f(textureDimensions(writeTex));
	let sensorAngle = agent.angle + sensorAngleOffset;
	let sensorDir = vec2f(cos(sensorAngle), sin(sensorAngle));
	let sensorCenter = vec2f(agent.pos + sensorDir * options.sensorDst);

	var sum = 0.0;
	var iSize = i32(options.sensorSize);
	for (var xoff = -iSize; xoff <= iSize; xoff++) {
		for (var yoff = -iSize; yoff <= iSize; yoff++) {
			var pos = sensorCenter + vec2(f32(xoff), f32(yoff));

			if (pos.x >= 0 && pos.x < tDims.x && pos.y >= 0 && pos.y < tDims.y) {
				var t = textureLoad(readTex, vec2i(pos), 0);
				sum += t.x;
			}
		}
	}

	return vec3(sum, sensorCenter);
}

@compute @workgroup_size(1) fn update_agents(
	@builtin(global_invocation_id) giid: vec3<u32>,
) {
	if (giid.x < 0 || giid.x >= options.agentCounts.x
		|| giid.y < 0 || giid.y >= options.agentCounts.y
		|| giid.z < 0 || giid.z >= options.agentCounts.z) {
		return;
	}

	let tDims = textureDimensions(readTex);
	let _id = giid.x 
		+ giid.y * options.agentCounts.x 
		+ giid.z * options.agentCounts.x * options.agentCounts.y;

	var agent = agents[_id];
	let prn = normHash(hash(
		u32(agent.pos.y * f32(tDims.x) + agent.pos.x) + hash(_id)
	));

	// pick a direction (w some random variance)
	// based on trail density at 3 possible points in front of agent.
	let senseFwd = sense(agent, 0);
	let senseLeft = sense(agent, options.sensorAngle);
	let senseRight = sense(agent, -options.sensorAngle);

	let weightFwd = senseFwd.x;
	let weightLeft = senseLeft.x;
	let weightRight = senseRight.x;

	var angle = 0.0;
	// continue in same dir
	if (weightFwd > weightLeft && weightFwd > weightRight) {
		angle = 0;
	}
	// turn randomly
	if (weightFwd < weightLeft && weightFwd < weightRight) {
		angle = (prn - 0.5) * 2 * options.turnSpeed * info.deltaTime;
	}
	// turn left
	else if (weightLeft > weightRight) {
		angle = prn * options.turnSpeed * info.deltaTime;
	}
	// turn right
	else if (weightRight > weightLeft) {
		angle = -prn * options.turnSpeed * info.deltaTime;
	}

	agents[_id].angle = (agents[_id].angle + angle) % (2 * PI);

	// move agent based on direction and speed
	let dir = vec2f(cos(agents[_id].angle), sin(agents[_id].angle));
	var newPos = agent.pos + dir * options.moveSpeed * info.deltaTime;

	// pick a new, random angle if hit a boundary
	if (newPos.x < 0 || newPos.x >= f32(tDims.x)
	|| newPos.y < 0 || newPos.y >= f32(tDims.y)) {
		newPos.x = clamp(newPos.x, 0, f32(tDims.x));
		newPos.y = clamp(newPos.y, 0, f32(tDims.y));
		// I shouldn't have to add & modulo, but if I just assign directly
		// to prn*2*PI, they get stuck! Not sure why.
		agents[_id].angle += (prn * 2 * PI) % (2 * PI);
	}

	agents[_id].pos = newPos;
	textureStore(writeTex, vec2u(newPos), vec4f(1));
}

@compute @workgroup_size(16) fn process_trailmap(
	@builtin(global_invocation_id) giid: vec3<u32>,
) {
	let tDims = textureDimensions(readTex);

	if (giid.x < 0 || giid.x >= tDims.x || giid.y < 0 || giid.y >= tDims.y) {
		return;
	}

	let inputValue = textureLoad(
		readTex,
		giid.xy,
		0
	);

	// Diffuse (blur) the trail by averaging the 3x3 block around current pixel
	// TODO: more efficient blur algo?
	var sum = vec4f(0);
	for (var xoff = -1; xoff <= 1; xoff++) {
		for (var yoff = -1; yoff <= 1; yoff++) {
			let xsample = i32(giid.x) + xoff;
			let ysample = i32(giid.y) + yoff;

			if (xsample >= 0 && xsample < i32(tDims.x )
					&& ysample >= 0 && ysample < i32(tDims.y)) 
			{
				sum += textureLoad(
					readTex,
					vec2i(xsample, ysample),
					0
				);
			}
		}
	}

	let blurResult = sum / 9;
	let diffusedValue = mix(
		inputValue,
		blurResult,
		min(.999, options.diffuseSpeed * info.deltaTime)
	);

	// Make the diffused trail also "evaporate" (fade out) over time
	let evaporatedValue = max(
		vec4f(0),
		diffusedValue - options.evaporateWeight * options.evaporateSpeed * info.deltaTime,
	);

	textureStore(
		writeTex,
		giid.xy,
		evaporatedValue
	);
}
