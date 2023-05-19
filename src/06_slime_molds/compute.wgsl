const PI = 3.14159265359;

struct SceneInfo {
	time: f32,
	deltaTime: f32,
};

struct SimOptions {
	diffuseSpeed: f32,
	evaporateSpeed: f32,
	moveSpeed: f32,
	numAgents: u32,
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
@group(1) @binding(2) var<storage, read_write> agents: array<Agent>;
// TODO: should probably change my agentMap to be a different texture format,
// since I'm only using one channel...
@group(1) @binding(3) var agentTex: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(4) var inputTex: texture_2d<f32>;
@group(1) @binding(5) var outputTex: texture_storage_2d<rgba8unorm, write>;

// todo: experiment with workgroup_size & possibly chunking...
@compute @workgroup_size(64) fn update_agents(
	@builtin(global_invocation_id) giid: vec3<u32>,
) {
	if (giid.x < 0 || giid.x >= options.numAgents) {
		return;
	}

	let tDims = vec2f(textureDimensions(agentTex));

	var agent = agents[giid.x];
	let prn = normHash(hash(
		u32(agent.pos.y * tDims.x + agent.pos.x) + hash(giid.x)
	));

	// move agent based on direction and speed
	let dir = vec2f(sin(agent.angle), cos(agent.angle));
	var newPos = agent.pos + dir * options.moveSpeed * info.deltaTime;

	// pick a new, random angle if hit a boundary
	// ! FIXME: agents are getting stuck on edges
	if (newPos.x < 0 || newPos.x >= tDims.x
	|| newPos.y < 0 || newPos.y >= tDims.y) {
		newPos.x = clamp(newPos.x, 0, tDims.x);
		newPos.y = clamp(newPos.y, 0, tDims.y);
		agents[giid.x].angle += (prn * 2 * PI) % (2 * PI);
	}

	agents[giid.x].pos = newPos;
	textureStore(agentTex, vec2u(agents[giid.x].pos), vec4f(.8));
}

@compute @workgroup_size(16) fn process_trailmap(
	@builtin(global_invocation_id) giid: vec3<u32>,
) {
	let tDims = textureDimensions(inputTex);

	if (giid.x < 0 || giid.x >= tDims.x || giid.y < 0 || giid.y >= tDims.y) {
		return;
	}

	let inputValue = textureLoad(
		inputTex,
		giid.xy,
		0
	);

	// Diffuse (blur) the trail by averaging the 3x3 block around current pixel
	var sum = vec4f(0);
	for (var xoff = -1; xoff <= 1; xoff++) {
		for (var yoff = -1; yoff <= 1; yoff++) {
			let xsample = i32(giid.x) + xoff;
			let ysample = i32(giid.y) + yoff;

			if (xsample >= 0 && xsample < i32(tDims.x )
					&& ysample >= 0 && ysample < i32(tDims.y)) 
			{
				sum += textureLoad(
					inputTex,
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
		options.diffuseSpeed * info.deltaTime
	);

	// Make the diffused trail also "evaporate" (fade out) over time
	let evaporatedValue = max(
		vec4f(0),
		diffusedValue - options.evaporateSpeed * info.deltaTime
	);

	textureStore(
		outputTex,
		giid.xy,
		evaporatedValue
	);
}
