// viewport dimensions
@group(0) @binding(0) var<uniform> vp: vec2f;

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

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	var pos = array<vec2f, 3>(
		vec2f( 0.0,  0.5),  // top center
		vec2f(-0.5, -0.5),  // bottom left
		vec2f( 0.5, -0.5)   // bottom right
	);

	return vec4f(pos[vi], 0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let frag_idx = pos.x + pos.y * vp.x;
    let v = hash(u32(frag_idx));
	return vec4f(v, v, v, 1.0);
}