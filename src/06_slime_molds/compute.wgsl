const PI = 3.14159265359;

struct SceneInfo {
	time: f32,
	deltaTime: f32,
};

struct SimOptions {
	moveSpeed: f32,
	evaporationSpeed: f32,
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
	if (newPos.x < 0 || newPos.x >= tDims.x
	|| newPos.y < 0 || newPos.y >= tDims.y) {
		newPos.x = clamp(newPos.x, 0, tDims.x - 1);
		newPos.y = clamp(newPos.y, 0, tDims.y - 1);
		agents[giid.x].angle = prn * 2 * PI;
	}

	agents[giid.x].pos = newPos;
	textureStore(agentTex, vec2u(agents[giid.x].pos), vec4f(.5, .5, .5, 1));
}

@compute @workgroup_size(16) fn process_trailmap(
	@builtin(global_invocation_id) giid: vec3<u32>,
) {
	let tDims = textureDimensions(inputTex);

	if (giid.x < 0 || giid.x >= tDims.x || giid.y < 0 || giid.y >= tDims.y) {
		return;
	}

	// take ProcessedTrailTexture and "dim" each texel
	var inputValue = textureLoad(
		inputTex,
		giid.xy,
		0
	);

	var evaporatedValue = max(
		vec4f(0),
		inputValue - options.evaporationSpeed * info.deltaTime
	);

	textureStore(
		outputTex,
		giid.xy,
		evaporatedValue
	);
}
