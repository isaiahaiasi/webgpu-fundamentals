const PI = 3.14159265359;

struct SceneInfo {
	time: f32,
	deltaTime: f32,
};

struct SimOptions {
	moveSpeed: f32,
	numAgents: i32,
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

// not sure if these should be storage or uniform...
@group(0) @binding(1) var<uniform> options: SimOptions;
@group(0) @binding(2) var<storage, read_write> agents: array<Agent>;

// not sure I can write to the texture in compute or not...
@group(0) @binding(3) var agentTex: texture_storage_2d<rgba8unorm, write>;

// todo: experiment with workgroup_size & possibly chunking...
@compute @workgroup_size(1) fn cs(
	@builtin(global_invocation_id) giid: vec3<u32>,
) {
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
		newPos.x = clamp(newPos.x, 1, tDims.x - 1);
		newPos.y = clamp(newPos.y, 1, tDims.y - 1);
		agents[giid.x].angle = prn * 2 * PI;
	}

	agents[giid.x].pos = newPos;
	textureStore(agentTex, vec2u(agents[giid.x].pos), vec4f(1, 1, 1, 1));
}
