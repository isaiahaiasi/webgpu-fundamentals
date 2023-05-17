const PI = 3.14159265359;

struct SceneInfo {
	vp: vec2f,	// viewport dimensions (what I think I actually need are the TEXTURE dimensions...)
	dt: f32,		// delta time
	// total time?
};

struct SimOptions {
	moveSpeed: f32,
};

struct Agent {
	pos: vec2f,
	angle: f32,
};

// Hash function www.cs.ubc.ca/~rbridson/docs/schechter-sca08-turbulence.pdf
fn hash(s: u32) -> f32 {
    var state = s;
    state ^= 2747636419u;
    state *= 2654435769u;
    state ^= state >> 16;
    state *= 2654435769u;
    state ^= state >> 16;
    state *= 2654435769u;
    return f32(state) / 4294967295.0;
}

// @group(0) @binding(0) var<uniform> info: SceneInfo;
// @group(0) @binding(1) var<storage, read> options: SimOptions;

// // not sure if it should be storage or uniform...
// @group(0) @binding(2) var<storage, read_write> agents: array<Agent>;

// not sure I can write to the texture in compute or not...
@group(0) @binding(3) var agentTex: texture_storage_2d<rgba8unorm, write>;

// todo: experiment with workgroup_size & possibly chunking...
@compute @workgroup_size(1) fn cs(
	@builtin(global_invocation_id) giid: vec3<u32>
) {
	// let agent = agents[id.x];
	// let prn = hash(agent.pos.y * info.vp.x + agent.pos.x + hash(id.x));

	// // move agent based on direction and speed
	// let dir = vec2f(cos(agent.angle), sin(agent.angle));
	// let newPos = agent.pos + dir * options.moveSpeed * info.dt;

	// // pick a new, random angle if hit a boundary
	// if (newPos.x < 0 || newPos.x > info.vp.x
	// || newPos.y < 0 || newPos.y >= info.vp.y) {
	// 	newPos.x = min(info.vp.x - 0.01, max(0, newPos.x));
	// 	newPos.y = min(info.vp.y - 0.01, max(0, newPos.y));
	// 	agent.angle = prn * 2 * PI;
	// }

	// agent.pos = newPos;
	// textureStore(agentTex, agent.pos, vec4f(1, 1, 1, 1));

	// initial test:
	// give each texel a random brightness
	const width = 128;
	var v = hash(giid.x + giid.y * width);
	var col = vec4f(v, v, v, 1);
	textureStore(agentTex, giid.xy, col);
}
